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
    const skus = [...merged].map(([skuId, qty]) => ({ skuId, qty }))
      .map((l) => ({ l, s: CATALOG.find((c) => c.id === l.skuId) }))
      .filter((x): x is { l: typeof x.l; s: NonNullable<typeof x.s> } => !!x.s && x.s.active !== false && x.s.brand === outlet.brand && Number.isInteger(x.l.qty) && x.l.qty > 0);
    if (!skus.length) throw new OpError(400, "Add at least one item before submitting.");
    const order: Order = {
      id: `WP-${String(1100 + db.orders.filter((o) => o.id.startsWith("WP-")).length + 1)}`,
      outletId: outlet.id,
      depot: outlet.depot,
      brand: outlet.brand,
      temp: outlet.brand === "Fresh" ? input.temp : "ambient",
      units: skus.reduce((s, x) => s + x.l.qty, 0),
      weightKg: Math.round(skus.reduce((s, x) => s + x.l.qty * x.s.weightKg, 0) * 10) / 10,
      volumeM3: Math.round(skus.reduce((s, x) => s + x.l.qty * x.s.volumeM3, 0) * 1000) / 1000,
      deferredYesterday: false,
      daysSinceLastServed: 1,
      source: "Store app",
      forDate: closed ? "next-run" : DEMO_DATE,
      createdAt: nowIso(),
      createdBy: a.name,
      lines: skus.map((x) => ({ skuId: x.s.id, name: x.s.name, unit: x.s.unit, qty: x.l.qty })),
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
    const key = `${input.orderId}|${input.skuId}`;
    const line = must(l.lines[key], "Load line");
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
    const flagged = new Set(db.shortfalls.filter((s) => s.tripId === tripId).map((s) => `${s.orderId}|${s.skuId}`));
    const open = Object.entries(l.lines).filter(([k, x]) => x.loaded < x.planned && !flagged.has(k));
    if (open.length) throw new OpError(409, `Load every line, or flag it as short, before releasing (${open.length} line${open.length > 1 ? "s" : ""} left).`);
    l.status = "released";
    l.releasedAt = nowIso();
    l.releasedBy = a.name;
  },

  resolveShortfall(db: Db, a: Actor, id: string, resolution: NonNullable<Shortfall["resolution"]>) {
    need(a, "dispatcher");
    const s = must(db.shortfalls.find((x) => x.id === id), "Shortfall");
    s.resolution = resolution;
    s.resolvedBy = a.name;
    const l = loadOf(db, s.tripId);
    if (resolution === "repick") {
      l.lines[`${s.orderId}|${s.skuId}`].loaded = s.planned;
      l.status = "loading";
    } else {
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
    const depot = depotOfVehicle(vehicleId);
    const seen = new Set(db.processedEventIds);
    for (const e of events) {
      if (seen.has(e.id)) {
        duplicates.push(e.id);
        continue;
      }
      const o = db.orders.find((x) => x.id === e.orderId);
      if (!o) continue; // an order that no longer exists: drop, never fail the whole batch
      const rec = db.stops[e.orderId] ?? { orderId: e.orderId, vehicleId, recordedAt: e.recordedAt, syncedAt: nowIso() };
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
    const plan = db.plans[depot];
    db.driverSync[vehicleId] = { lastSyncAt: nowIso(), lastPlanVersion: plan?.version ?? 0 };
    return { accepted, duplicates, planVersion: plan?.version ?? 0 };
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
    if (!db.stops[r.orderId]?.pod) throw new OpError(409, "There is no proof of delivery for this order yet.");
    if (db.receipts[r.orderId]) throw new OpError(409, "This receipt was already confirmed.");
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
