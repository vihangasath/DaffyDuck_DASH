// Operational business rules, run by the API against the state loaded from the database.
// Each op mutates the Db document it is given; the API persists the difference in one transaction.
// Authorisation lives here too, next to the rule it protects: the caller's role and scope come from
// the session, never from the request body.
import { CATALOG, deriveLines } from "./domain/catalog";
import type { Depot, Order, Plan, Role, Temp, VehicleStatus } from "./domain/types";
import type { SeedData } from "./domain/network";
import { autoPlan, moveOrder as plannerMove, validatePlan, type MoveTarget } from "./planner/allocate";
import { consequence } from "./planner/priority";
import type { Violation } from "./planner/evaluate";
import { contextFor, DEMO_DATE, festivalRamp, net, outletName, seed } from "./reference";
import type { Db, DispatchException, DriverEvent, LoadCheck, Notice, Receipt, Shortfall, SyncResult } from "./contract";

export interface Actor {
  userId: string;
  name: string;
  role: Role;
  depot: Depot;
  vehicleId?: string;
  outletId?: string;
  outletScope?: "outlet" | "depot";
}

/** A refusal the API returns as-is: `status` is the HTTP status, `message` is shown to the user. */
export class OpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const uid = () => crypto.randomUUID();
const NOT_RELEASED = "Trip has not been released by the loader.";
const nowIso = () => new Date().toISOString();

function need(a: Actor, ...roles: Role[]) {
  if (!roles.includes(a.role)) throw new OpError(403, "Your account can’t do that.");
}
function needDepot(a: Actor, depot: Depot) {
  if (a.role === "loader" && a.depot !== depot) throw new OpError(403, `Your account works at the ${a.depot} dock, not ${depot}.`);
}
function needOutlet(a: Actor, outletId: string) {
  if (a.role !== "store") return;
  const o = net.outlets.get(outletId);
  const ok = a.outletScope === "depot" ? o?.depot === a.depot : a.outletId === outletId;
  if (!ok) throw new OpError(403, "That outlet isn’t on your account.");
}
function must<T>(v: T | undefined | null, what: string): T {
  if (v == null) throw new OpError(404, `${what} not found.`);
  return v;
}

/** Start-of-day state from a dataset (the bundled seed by default). */
export function initialDb(data: Pick<SeedData, "orders" | "fleetStatus" | "deferralLog"> = seed): Db {
  return {
    schema: 3,
    orders: data.orders.map((o) => ({ ...o, forDate: DEMO_DATE, createdBy: "Store (seeded)", lines: deriveLines(o) })),
    day: { Peliyagoda: { ordersClosed: false }, Kandy: { ordersClosed: false } },
    plans: { Peliyagoda: null, Kandy: null },
    fleetStatus: Object.fromEntries(data.fleetStatus.map((f) => [f.vehicleId, f.status])),
    loads: {},
    shortfalls: [],
    stops: {},
    receipts: {},
    notices: [],
    exceptions: [],
    driverSync: {},
    processedEventIds: [],
    deferralLog: data.deferralLog.map((d, i) => ({
      id: `H-${String(i).padStart(4, "0")}`,
      orderId: d.orderId, date: d.date, outletId: d.outletId, brand: d.brand, temp: d.temp, volumeM3: d.volumeM3,
      code: "HISTORICAL" as const, reason: d.reason, decidedBy: d.decidedBy, storeNotified: d.storeNotified,
    })),
  };
}

const depotOrders = (db: Db, depot: Depot) => db.orders.filter((o) => o.depot === depot && o.forDate === DEMO_DATE);
const ctxOf = (db: Db) => contextFor(db.orders, db.fleetStatus);
const depotOfVehicle = (vehicleId: string) => must(net.vehicles.get(vehicleId), `Vehicle ${vehicleId}`).depot;

function notice(db: Db, n: Omit<Notice, "id" | "at">) {
  db.notices.unshift({ ...n, id: uid(), at: nowIso() });
}
function exception(db: Db, e: Omit<DispatchException, "id" | "at">) {
  db.exceptions.unshift({ ...e, id: uid(), at: nowIso() });
}
function planOf(db: Db, depot: Depot): Plan {
  return must(db.plans[depot], `Plan for ${depot}`);
}
function loadOf(db: Db, tripId: string): LoadCheck {
  return must(db.loads[tripId], "Load list");
}

/** Remember who received each stop when a vehicle leaves, even if dispatch later changes the plan offline. */
function markReleasedStops(db: Db, tripId: string, vehicleId: string) {
  const plan = db.plans[depotOfVehicle(vehicleId)];
  if (plan?.status !== "published") throw new OpError(409, "Publish the plan before releasing a vehicle.");
  const trip = must(plan.trips.find((t) => t.id === tripId && t.vehicleId === vehicleId), "Trip in published plan");
  const at = nowIso();
  for (const orderId of trip.orderIds) {
    if (!db.stops[orderId]) db.stops[orderId] = { orderId, vehicleId, recordedAt: at, syncedAt: at };
  }
}

/** Keeps each trip's load list in step with the plan; flags lists that changed after loading began. */
function syncLoads(db: Db, plan: Plan, live = false) {
  const orders = new Map(db.orders.map((o) => [o.id, o]));
  for (const trip of plan.trips) {
    const want: LoadCheck["lines"] = {};
    for (const id of trip.orderIds) for (const l of (orders.get(id)!.lines ?? [])) want[`${id}|${l.skuId}`] = { planned: l.qty, loaded: 0 };
    const cur = db.loads[trip.id];
    if (!cur) {
      db.loads[trip.id] = { tripId: trip.id, vehicleId: trip.vehicleId, planVersion: plan.version, changedVersion: live ? plan.version : undefined, lines: want, status: "not_started" };
      continue;
    }
    const same = Object.keys(want).sort().join() === Object.keys(cur.lines).sort().join() && cur.vehicleId === trip.vehicleId;
    if (same) continue;
    for (const k of Object.keys(want)) if (cur.lines[k]) want[k].loaded = cur.lines[k].loaded;
    // A truck that has left can lose stops (they stay on board, undelivered) but can never gain lines.
    const onlyRemoved = Object.keys(want).every((k) => k in cur.lines);
    db.loads[trip.id] = { ...cur, vehicleId: trip.vehicleId, lines: want, planVersion: plan.version, changedVersion: plan.version, status: cur.status === "released" && !onlyRemoved ? "loading" : cur.status };
  }
}

export interface PlaceOrderArgs {
  outletId: string;
  temp: Temp;
  lines: { skuId: string; qty: number }[];
}

/** Every operation the web app can ask for. Arguments arrive from JSON; the API validates their shape first. */
export const ops = {
  placeOrder(db: Db, a: Actor, input: PlaceOrderArgs): Order {
    need(a, "store");
    needOutlet(a, input.outletId);
    const outlet = must(net.outlets.get(input.outletId), "Outlet");
    if (outlet.active === false) throw new OpError(409, "This outlet is closed for ordering.");
    const closed = db.day[outlet.depot].ordersClosed;
    const merged = new Map<string, number>();
    for (const l of input.lines) merged.set(l.skuId, (merged.get(l.skuId) ?? 0) + l.qty);
    if (outlet.brand !== "Fresh" && input.temp !== "ambient")
      throw new OpError(400, "Only Fresh outlets can place chilled orders.");
    const temp = input.temp;
    const skus = [...merged].map(([skuId, qty]) => ({
      l: { skuId, qty },
      s: CATALOG.find((c) => c.id === skuId),
    }));
    if (!skus.length) throw new OpError(400, "Add at least one item before submitting.");
    if (skus.some(({ l, s }) => !s || s.active === false || s.brand !== outlet.brand || s.temp !== temp || !Number.isSafeInteger(l.qty) || l.qty <= 0))
      throw new OpError(400, `Every item must be an active ${outlet.brand} product for the ${temp} order.`);
    const validSkus = skus as { l: { skuId: string; qty: number }; s: NonNullable<(typeof skus)[number]["s"]> }[];
    const order: Order = {
      id: `WP-${String(1100 + db.orders.filter((o) => o.id.startsWith("WP-")).length + 1)}`,
      outletId: outlet.id,
      depot: outlet.depot,
      brand: outlet.brand,
      temp,
      units: validSkus.reduce((s, x) => s + x.l.qty, 0),
      weightKg: Math.round(validSkus.reduce((s, x) => s + x.l.qty * x.s.weightKg, 0) * 10) / 10,
      volumeM3: Math.round(validSkus.reduce((s, x) => s + x.l.qty * x.s.volumeM3, 0) * 1000) / 1000,
      deferredYesterday: false,
      daysSinceLastServed: 1,
      source: "Store app",
      forDate: closed ? "next-run" : DEMO_DATE,
      createdAt: nowIso(),
      createdBy: a.name,
      lines: validSkus.map((x) => ({ skuId: x.s.id, name: x.s.name, unit: x.s.unit, qty: x.l.qty })),
    };
    db.orders.push(order);
    notice(db, {
      outletId: outlet.id,
      orderId: order.id,
      kind: "order_confirmed",
      title: `Order ${order.id} confirmed`,
      body: closed
        ? "Received after today’s 16:00 cutoff — it will be planned on the next run."
        : `${order.units} units · ${order.volumeM3.toFixed(2)} m³ · ${order.temp}. Planned tonight for delivery ${outlet.windowOpen}–${outlet.windowClose}.`,
    });
    return order;
  },

  closeOrdersAndPlan(db: Db, a: Actor, depot: Depot): Plan {
    need(a, "dispatcher");
    if (db.plans[depot]) throw new OpError(409, "A plan already exists for this depot. Use Replan while it is a draft, or edit a published plan move by move.");
    db.day[depot] = { ordersClosed: true, closedAt: nowIso(), closedBy: a.name };
    const plan = autoPlan({ date: DEMO_DATE, depot, orders: depotOrders(db, depot), ctx: ctxOf(db), festivalRamp });
    db.plans[depot] = plan;
    return plan;
  },

  replan(db: Db, a: Actor, depot: Depot): Plan {
    need(a, "dispatcher");
    const prev = db.plans[depot];
    if (prev?.status === "published") throw new OpError(409, "Published plans are edited move by move.");
    const plan = autoPlan({ date: DEMO_DATE, depot, orders: depotOrders(db, depot), ctx: ctxOf(db), festivalRamp, version: (prev?.version ?? 0) + 1 });
    db.plans[depot] = plan;
    return plan;
  },

  moveOrder(db: Db, a: Actor, depot: Depot, orderId: string, target: MoveTarget): { ok: boolean; violations: Violation[]; warnings: string[] } {
    need(a, "dispatcher");
    const plan = planOf(db, depot);
    const order = must(db.orders.find((o) => o.id === orderId), "Order");
    if (order.depot !== depot || order.forDate !== DEMO_DATE ||
      (!plan.deferred.some((d) => d.orderId === orderId) && !plan.trips.some((t) => t.orderIds.includes(orderId))))
      throw new OpError(409, "This order is not in the selected depot's current plan.");
    const source = plan.trips.find((t) => t.orderIds.includes(orderId));
    if ("defer" in target && (db.stops[orderId]?.arrivedAt || db.stops[orderId]?.deliveredAt))
      throw new OpError(409, "The driver has already reached this stop. Resolve the delivery outcome instead.");
    if (source && db.loads[source.id]?.status === "released" && !("defer" in target))
      throw new OpError(409, "That order is already on a vehicle that left the depot.");
    if ("newTripOn" in target && !net.vehicles.has(target.newTripOn))
      throw new OpError(404, "Target vehicle not found.");
    if ("defer" in target) target = { ...target, by: a.name };
    if ("tripId" in target && db.loads[target.tripId]?.status === "released") {
      const t = must(plan.trips.find((x) => x.id === target.tripId), "Trip");
      return { ok: false, violations: [{ code: "UNAVAILABLE", message: `${t.vehicleId} trip ${t.tripNo} has already left the depot — choose a trip that is still loading.` }], warnings: [] };
    }
    const r = plannerMove(plan, orderId, target, ctxOf(db));
    if (r.ok) {
      const wasPublished = plan.status === "published";
      db.plans[depot] = { ...r.plan, version: plan.version + 1, status: wasPublished ? "published" : "draft", publishedAt: plan.publishedAt };
      if (wasPublished) syncLoads(db, db.plans[depot]!, true);
      if ("defer" in target) {
        const o = must(db.orders.find((x) => x.id === orderId), "Order");
        if (wasPublished)
          notice(db, { outletId: o.outletId, orderId, kind: "deferral", title: `${o.temp === "chilled" ? "Chilled" : "Dry"} order moved to the next run`, body: `${target.note ? target.note + " " : ""}Dispatch changed today’s plan: ${db.plans[depot]!.deferred.find((d) => d.orderId === orderId)!.reason} You will be first priority on the next run.` });
        db.deferralLog.unshift({ id: uid(), orderId, date: DEMO_DATE, outletId: o.outletId, brand: o.brand, temp: o.temp, volumeM3: o.volumeM3, code: target.code ?? "MANUAL", reason: target.note || "Deferred by the dispatcher.", decidedBy: a.name, storeNotified: wasPublished });
      }
    }
    return { ok: r.ok, violations: r.violations, warnings: r.warnings };
  },

  publishPlan(db: Db, a: Actor, depot: Depot): Plan {
    need(a, "dispatcher");
    const plan = planOf(db, depot);
    const orders = depotOrders(db, depot);
    const problems = validatePlan(plan, orders, ctxOf(db));
    if (problems.length) throw new OpError(409, problems[0].message);
    const published: Plan = { ...plan, status: "published", publishedAt: nowIso() };
    db.plans[depot] = published;
    syncLoads(db, published);
    const byId = new Map(orders.map((o) => [o.id, o]));
    for (const d of published.deferred) {
      const o = byId.get(d.orderId)!;
      if (db.notices.some((n) => n.kind === "deferral" && n.orderId === o.id)) continue;
      notice(db, {
        outletId: o.outletId,
        orderId: o.id,
        kind: "deferral",
        title: `${o.temp === "chilled" ? "Chilled" : "Dry"} order moved to the next run`,
        body: `${d.note ? d.note + " " : ""}${d.reason} You will be first priority on the next run. (${consequence(o)})`,
      });
      db.deferralLog.unshift({ id: uid(), orderId: o.id, date: DEMO_DATE, outletId: o.outletId, brand: o.brand, temp: o.temp, volumeM3: o.volumeM3, code: d.code, reason: d.reason, decidedBy: d.decidedBy === "Auto-plan" ? `Auto-plan · published by ${a.name}` : d.decidedBy, storeNotified: true });
    }
    return published;
  },

  setVehicleStatus(db: Db, a: Actor, vehicleId: string, status: VehicleStatus) {
    need(a, "dispatcher", "admin");
    must(net.vehicles.get(vehicleId), `Vehicle ${vehicleId}`);
    const plan = db.plans[depotOfVehicle(vehicleId)];
    if (status === "in_workshop" && plan?.trips.some((t) => t.vehicleId === vehicleId)) throw new OpError(409, `${vehicleId} has trips in today’s plan. Move its trips first.`);
    db.fleetStatus[vehicleId] = status;
  },

  setLoadLine(db: Db, a: Actor, tripId: string, key: string, loaded: number) {
    need(a, "loader");
    const l = loadOf(db, tripId);
    needDepot(a, depotOfVehicle(l.vehicleId));
    if (l.status === "released" || l.status === "held") throw new OpError(409, "This vehicle’s load list is locked.");
    const line = must(l.lines[key], "Load line");
    line.loaded = Math.max(0, Math.min(Math.round(loaded), line.planned));
    if (l.status === "not_started") l.status = "loading";
  },

  flagShortfall(db: Db, a: Actor, input: Pick<Shortfall, "tripId" | "orderId" | "skuId" | "loaded" | "kind" | "decision" | "photo">): Shortfall {
    need(a, "loader");
    const l = loadOf(db, input.tripId);
    const depot = depotOfVehicle(l.vehicleId);
    needDepot(a, depot);
    if (l.status === "released" || l.status === "held") throw new OpError(409, "This vehicle’s load list is locked.");
    const key = `${input.orderId}|${input.skuId}`;
    const line = must(l.lines[key], "Load line");
    if (db.shortfalls.some((s) => s.tripId === input.tripId && s.orderId === input.orderId && s.skuId === input.skuId && !s.resolution))
      throw new OpError(409, "This item already has an open shortfall.");
    const order = must(db.orders.find((o) => o.id === input.orderId), "Order");
    const item = order.lines?.find((x) => x.skuId === input.skuId);
    const loaded = Math.max(0, Math.min(Math.round(input.loaded), line.planned));
    const s: Shortfall = {
      ...input, loaded, id: uid(), at: nowIso(), by: a.name, vehicleId: l.vehicleId, outletId: order.outletId,
      name: item?.name ?? input.skuId, planned: line.planned,
    };
    db.shortfalls.unshift(s);
    line.loaded = loaded;
    const ref = { tripId: s.tripId, vehicleId: s.vehicleId, orderId: s.orderId, shortfallId: s.id };
    if (s.decision === "hold") {
      l.status = "held";
      exception(db, {
        depot, kind: "shortfall", severity: "danger", title: `${s.vehicleId} held · shortfall`,
        body: `${s.name}: ${s.loaded} of ${s.planned} loaded for ${outletName(s.outletId)} (${s.kind.replace("_", " ")}). Loader is waiting for your decision.`, ref,
      });
    } else {
      exception(db, {
        depot, kind: "shortfall", severity: "warning", title: `${s.vehicleId} · released with shortfall`,
        body: `${s.name}: ${s.loaded} of ${s.planned} for ${outletName(s.outletId)}. Store informed; balance goes on the next run.`, ref,
      });
      notice(db, { outletId: s.outletId, orderId: s.orderId, kind: "shortfall", title: "Part of your order is short", body: `${s.loaded} of ${s.planned} × ${s.name} are on the truck. The balance will come on the next run.` });
    }
    return s;
  },

  releaseTrip(db: Db, a: Actor, tripId: string) {
    need(a, "loader");
    const l = loadOf(db, tripId);
    needDepot(a, depotOfVehicle(l.vehicleId));
    if (l.status === "held") throw new OpError(409, "Dispatch must resolve the held shortfall before this vehicle can leave.");
    if (l.status === "released") throw new OpError(409, "This vehicle has already left the dock.");
    const flagged = new Set(db.shortfalls.filter((s) => s.tripId === tripId && s.resolution !== "repick").map((s) => `${s.orderId}|${s.skuId}`));
    const open = Object.entries(l.lines).filter(([k, x]) => x.loaded < x.planned && !flagged.has(k));
    if (open.length) throw new OpError(409, `Load every line, or flag it as short, before releasing (${open.length} line${open.length > 1 ? "s" : ""} left).`);
    markReleasedStops(db, tripId, l.vehicleId);
    l.status = "released";
    l.releasedAt = nowIso();
    l.releasedBy = a.name;
  },

  resolveShortfall(db: Db, a: Actor, id: string, resolution: NonNullable<Shortfall["resolution"]>) {
    need(a, "dispatcher");
    const s = must(db.shortfalls.find((x) => x.id === id), "Shortfall");
    if (s.resolution) throw new OpError(409, "This shortfall has already been resolved.");
    if (s.decision !== "hold") throw new OpError(409, "This shortfall was already released from the dock.");
    const l = loadOf(db, s.tripId);
    if (l.status !== "held") throw new OpError(409, "This vehicle is not waiting for a dispatcher decision.");
    if (resolution !== "repick") {
      const open = Object.entries(l.lines).filter(([key, line]) =>
        key !== `${s.orderId}|${s.skuId}` && line.loaded < line.planned);
      if (open.length) throw new OpError(409, "The loader must finish or flag every other line before the vehicle can be released.");
    }
    s.resolution = resolution;
    s.resolvedBy = a.name;
    if (resolution === "repick") {
      l.status = "loading";
    } else {
      markReleasedStops(db, s.tripId, l.vehicleId);
      l.status = "released";
      l.releasedAt = nowIso();
      l.releasedBy = a.name;
      notice(db, { outletId: s.outletId, orderId: s.orderId, kind: "shortfall", title: "Part of your order is short", body: `${s.loaded} of ${s.planned} × ${s.name} are on the truck. The balance comes on the next run with priority.` });
    }
    db.exceptions.forEach((e) => {
      if (e.ref.shortfallId === id) e.resolved = true;
    });
  },

  syncDriverEvents(db: Db, a: Actor, vehicleId: string, events: DriverEvent[]): SyncResult {
    need(a, "driver");
    if (a.vehicleId !== vehicleId) throw new OpError(403, `Your account is assigned to ${a.vehicleId ?? "no vehicle"}, not ${vehicleId}.`);
    const accepted: string[] = [];
    const duplicates: string[] = [];
    const rejected: SyncResult["rejected"] = [];
    const depot = depotOfVehicle(vehicleId);
    const plan = db.plans[depot];
    const seen = new Set(db.processedEventIds);
    for (const e of events) {
      if (seen.has(e.id)) {
        duplicates.push(e.id);
        continue;
      }
      const o = db.orders.find((x) => x.id === e.orderId);
      if (!o) {
        rejected.push({ id: e.id, reason: "Order no longer exists." });
        continue;
      }
      const trip = plan?.status === "published" ? plan.trips.find((t) => t.vehicleId === vehicleId && t.orderIds.includes(e.orderId)) : undefined;
      const existing = db.stops[e.orderId];
      // A previously synced arrival proves that an offline completion belonged to this driver,
      // even if dispatch removed the stop while the phone was out of coverage.
      const assigned = !!trip || existing?.vehicleId === vehicleId;
      const reason =
        e.vehicleId !== vehicleId ? "Event vehicle differs from the signed-in driver's vehicle."
        : !assigned ? "Stop is not assigned to this driver's run."
        : trip && db.loads[trip.id]?.status !== "released" ? NOT_RELEASED
        : existing?.deliveredAt ? "Delivery has already been recorded."
        : existing?.problem ? "A problem has already been recorded for this stop."
        : null;
      if (reason) {
        rejected.push({ id: e.id, reason, retry: reason === NOT_RELEASED });
        continue;
      }
      if (e.kind === "delivered") {
        const planned = new Map((o.lines ?? []).map((l) => [l.skuId, l.qty]));
        const supplied = new Set(e.pod.lines.map((l) => l.skuId));
        const valid = e.pod.signed && planned.size === supplied.size && e.pod.lines.length === planned.size && e.pod.lines.every((l) =>
          planned.get(l.skuId) === l.planned && l.delivered <= l.planned &&
          (!trip || l.delivered <= (db.loads[trip.id]?.lines[`${e.orderId}|${l.skuId}`]?.loaded ?? 0)));
        if (!valid) {
          rejected.push({ id: e.id, reason: "Proof of delivery must match the order and the goods released from the dock." });
          continue;
        }
      }
      const rec = existing ?? { orderId: e.orderId, vehicleId, recordedAt: e.recordedAt, syncedAt: nowIso() };
      if (e.kind === "arrived") rec.arrivedAt = e.at;
      if (e.kind === "delivered") {
        rec.deliveredAt = e.at;
        rec.pod = e.pod;
        const short = e.pod.lines.filter((l) => l.delivered < l.planned);
        notice(db, { outletId: o.outletId, orderId: o.id, kind: "delivered", title: `Delivered at ${e.at}`, body: `Signed by ${e.pod.receivedBy}. ${short.length ? `Driver recorded ${short.map((l) => `${l.planned - l.delivered} × ${l.name} short`).join(", ")}.` : "All items recorded as delivered."} Please confirm receipt.` });
        if (short.length) exception(db, { depot, kind: "delivered_with_issue", severity: "info", title: `${outletName(o.outletId)} · delivered with shortage`, body: short.map((l) => `${l.name}: ${l.delivered}/${l.planned}`).join(" · "), ref: { orderId: o.id, vehicleId } });
      }
      if (e.kind === "problem") {
        rec.problem = e.problem;
        exception(db, { depot, kind: "failed_stop", severity: "danger", title: `${outletName(o.outletId)} · not delivered`, body: `${e.problem.reason}${e.problem.tempC != null ? ` · probe ${e.problem.tempC} °C` : ""}${e.problem.note ? ` · ${e.problem.note}` : ""}`, ref: { orderId: o.id, vehicleId } });
        notice(db, { outletId: o.outletId, orderId: o.id, kind: "eta", title: "Delivery not completed", body: `Driver reported: ${e.problem.reason}. Dispatch will contact you with a new time.` });
      }
      rec.recordedAt = e.recordedAt;
      rec.syncedAt = nowIso();
      db.stops[e.orderId] = rec;
      db.processedEventIds.push(e.id);
      seen.add(e.id);
      accepted.push(e.id);
    }
    db.driverSync[vehicleId] = { lastSyncAt: nowIso(), lastPlanVersion: plan?.version ?? 0 };
    return { accepted, duplicates, rejected, planVersion: plan?.version ?? 0 };
  },

  ackNotice(db: Db, a: Actor, id: string, response: "ok" | "reduce") {
    need(a, "store");
    const n = must(db.notices.find((x) => x.id === id), "Notice");
    needOutlet(a, n.outletId);
    n.acknowledged = response;
  },

  confirmReceipt(db: Db, a: Actor, r: Omit<Receipt, "confirmedAt" | "by">) {
    need(a, "store");
    const o = must(db.orders.find((x) => x.id === r.orderId), "Order");
    needOutlet(a, o.outletId);
    const pod = db.stops[r.orderId]?.pod;
    if (!pod) throw new OpError(409, "There is no proof of delivery for this order yet.");
    if (db.receipts[r.orderId]) throw new OpError(409, "This receipt was already confirmed.");
    const driverLines = new Map(pod.lines.map((l) => [l.skuId, l]));
    if (r.lines.length !== driverLines.size || new Set(r.lines.map((l) => l.skuId)).size !== r.lines.length ||
      r.lines.some((l) => {
        const driver = driverLines.get(l.skuId);
        return !driver || l.name !== driver.name || l.driverQty !== driver.delivered || l.receivedQty > driver.planned;
      }))
      throw new OpError(400, "Receipt quantities must match the driver's proof of delivery.");
    db.receipts[r.orderId] = { ...r, by: a.name, confirmedAt: nowIso() };
    if (r.issues.length)
      exception(db, { depot: o.depot, kind: "receipt_issue", severity: "warning", title: `${outletName(o.outletId)} · receipt issue`, body: r.issues.map((i) => i.type + (i.note ? ` (${i.note})` : "")).join(" · "), ref: { orderId: o.id } });
  },

  resolveException(db: Db, a: Actor, id: string) {
    need(a, "dispatcher");
    must(db.exceptions.find((x) => x.id === id), "Exception").resolved = true;
  },
};

export type OpName = keyof typeof ops;

const pick = <T>(rec: Record<string, T>, keep: (key: string, v: T) => boolean) =>
  Object.fromEntries(Object.entries(rec).filter(([k, v]) => keep(k, v)));

/**
 * The slice of operational state a signed-in user may read. Dispatchers plan the whole network and
 * see everything; everyone else gets their own work plus what the shared screens need to compute it
 * (a stop's ETA depends on the other stops on its trip, so those orders stay, without their contents).
 */
export function visibleTo(db: Db, a: Actor): Db {
  if (a.role === "dispatcher") return db;
  const none = { shortfalls: [], stops: {}, receipts: {}, notices: [], exceptions: [], driverSync: {}, processedEventIds: [], deferralLog: [] };
  const depotOnly = (depot: Depot) => ({ ...db.plans, Peliyagoda: null, Kandy: null, [depot]: db.plans[depot] }) as Db["plans"];

  if (a.role === "loader") {
    const vehicles = (vid: string) => depotOfVehicle(vid) === a.depot;
    return {
      ...db, ...none,
      orders: db.orders.filter((o) => o.depot === a.depot),
      plans: depotOnly(a.depot),
      loads: pick(db.loads, (_, l) => vehicles(l.vehicleId)),
      shortfalls: db.shortfalls.filter((s) => vehicles(s.vehicleId)),
    };
  }

  if (a.role === "driver") {
    const vid = a.vehicleId;
    const depot = (vid && net.vehicles.get(vid)?.depot) || a.depot;
    const plan = db.plans[depot];
    const trips = plan?.trips.filter((t) => t.vehicleId === vid) ?? [];
    const stops = pick(db.stops, (_, s) => s.vehicleId === vid);
    const ids = new Set([...trips.flatMap((t) => t.orderIds), ...Object.keys(stops)]);
    return {
      ...db, ...none,
      orders: db.orders.filter((o) => ids.has(o.id)),
      plans: { ...depotOnly(depot), [depot]: plan && { ...plan, trips, deferred: [] } },
      loads: pick(db.loads, (_, l) => l.vehicleId === vid),
      stops,
      shortfalls: db.shortfalls.filter((s) => s.vehicleId === vid),
      driverSync: pick(db.driverSync, (k) => k === vid),
    };
  }

  // Store managers: their outlet (or their depot's outlets for an area manager).
  const mine = (outletId: string) => {
    try {
      needOutlet(a, outletId);
      return true;
    } catch {
      return false;
    }
  };
  const own = new Set(db.orders.filter((o) => mine(o.outletId)).map((o) => o.id));
  const plans = Object.fromEntries(Object.entries(db.plans).map(([d, p]) => [d, p && { ...p, deferred: p.deferred.filter((x) => own.has(x.orderId)) }])) as Db["plans"];
  const tripsWithMine = Object.values(db.plans).flatMap((p) => p?.trips ?? []).filter((t) => t.orderIds.some((id) => own.has(id)));
  const onMyTrips = new Set(tripsWithMine.flatMap((t) => t.orderIds));
  return {
    ...db, ...none,
    orders: db.orders
      .filter((o) => own.has(o.id) || onMyTrips.has(o.id))
      .map((o) => (own.has(o.id) ? o : { ...o, lines: undefined, createdBy: "", source: "" })),
    plans,
    loads: Object.fromEntries(tripsWithMine.flatMap((t) => {
      const l = db.loads[t.id];
      return l ? [[t.id, { ...l, lines: pick(l.lines, (k) => own.has(k.split("|")[0])) }]] : [];
    })),
    stops: pick(db.stops, (id) => own.has(id)),
    receipts: pick(db.receipts, (id) => own.has(id)),
    notices: db.notices.filter((n) => mine(n.outletId)),
    shortfalls: db.shortfalls.filter((s) => own.has(s.orderId)),
    deferralLog: db.deferralLog.filter((d) => mine(d.outletId)),
  };
}
