// The API's view of operational state. It keeps the current state in memory (this process is the only
// writer) and, for every change, persists exactly the rows that differ inside one transaction, together
// with an audit entry. Business rules (packages/core/src/ops.ts) never touch SQL.
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { ConnectivityEvent, Db as OpsDb, DispatchException, DriverSyncState, LoadCheck, Notice, PhotoMeta, Receipt, Shortfall, StopRecord } from "@waypoint/core/contract";
import type { Depot, Order, Plan } from "@waypoint/core/domain/types";
import type { Tx } from "./db/client.ts";
import * as t from "./db/schema.ts";

type Row = Record<string, unknown>;

interface Projection {
  table: PgTable;
  keys: string[];
  rows: (d: OpsDb) => Row[];
  /** Newest-first lists backed by a `seq` column: new rows are inserted oldest first. */
  newestFirst?: boolean;
  /** Only ever updates existing rows (vehicle status lives on the vehicles master table). */
  updateOnly?: boolean;
  /** Rows are immutable once written (idempotency log). */
  insertOnly?: boolean;
  /** Written outside the diff (photo bytes go in with their upload); only read back here. */
  readOnly?: boolean;
}

const nn = <T,>(v: T | undefined): T | null => (v === undefined ? null : v);
const DEPOTS: Depot[] = ["Peliyagoda", "Kandy"];

// Parent tables come before their children: upserts run in this order, deletes in reverse.
const PROJECTIONS: Projection[] = [
  {
    table: t.vehicles,
    keys: ["id"],
    updateOnly: true,
    rows: (d) => Object.entries(d.fleetStatus).map(([id, status]) => ({ id, status })),
  },
  {
    table: t.orders,
    keys: ["id"],
    rows: (d) =>
      d.orders.map((o) => ({
        id: o.id, outletId: o.outletId, depotId: o.depot, brand: o.brand, temp: o.temp, units: o.units, weightKg: o.weightKg,
        volumeM3: o.volumeM3, deferredYesterday: o.deferredYesterday, daysSinceLastServed: o.daysSinceLastServed, source: o.source,
        forDate: nn(o.forDate), createdAt: nn(o.createdAt), createdBy: nn(o.createdBy), confirmCode: nn(o.confirmCode),
      })),
  },
  {
    table: t.orderLines,
    keys: ["orderId", "skuId"],
    rows: (d) => d.orders.flatMap((o) => (o.lines ?? []).map((l, position) => ({ orderId: o.id, skuId: l.skuId, name: l.name, unit: l.unit, qty: l.qty, position }))),
  },
  {
    table: t.opsDays,
    keys: ["depotId"],
    rows: (d) => DEPOTS.map((depotId) => ({ depotId, ordersClosed: d.day[depotId].ordersClosed, closedAt: nn(d.day[depotId].closedAt), closedBy: nn(d.day[depotId].closedBy) })),
  },
  {
    table: t.plans,
    keys: ["depotId"],
    rows: (d) => plansOf(d).map((p) => ({ depotId: p.depot, date: p.date, version: p.version, status: p.status, publishedAt: nn(p.publishedAt) })),
  },
  {
    table: t.trips,
    keys: ["id"],
    rows: (d) => plansOf(d).flatMap((p) => p.trips.map((tr, position) => ({ id: tr.id, depotId: p.depot, vehicleId: tr.vehicleId, tripNo: tr.tripNo, brand: tr.brand, district: tr.district, position }))),
  },
  {
    table: t.tripStops,
    keys: ["tripId", "seq"],
    rows: (d) => plansOf(d).flatMap((p) => p.trips.flatMap((tr) => tr.orderIds.map((orderId, seq) => ({ tripId: tr.id, seq, orderId })))),
  },
  {
    table: t.planDeferrals,
    keys: ["depotId", "orderId"],
    rows: (d) =>
      plansOf(d).flatMap((p) =>
        p.deferred.map((x, position) => ({ depotId: p.depot, orderId: x.orderId, code: x.code, reason: x.reason, note: nn(x.note), decidedBy: x.decidedBy, decidedAt: x.decidedAt, position })),
      ),
  },
  {
    table: t.loads,
    keys: ["tripId"],
    rows: (d) =>
      Object.values(d.loads).map((l) => ({ tripId: l.tripId, vehicleId: l.vehicleId, planVersion: l.planVersion, changedVersion: nn(l.changedVersion), status: l.status, releasedAt: nn(l.releasedAt), releasedBy: nn(l.releasedBy) })),
  },
  {
    table: t.loadLines,
    keys: ["tripId", "lineKey"],
    rows: (d) => Object.values(d.loads).flatMap((l) => Object.entries(l.lines).map(([lineKey, x]) => ({ tripId: l.tripId, lineKey, planned: x.planned, loaded: x.loaded }))),
  },
  {
    table: t.shortfalls,
    keys: ["id"],
    newestFirst: true,
    rows: (d) =>
      d.shortfalls.map((s) => ({
        id: s.id, tripId: s.tripId, vehicleId: s.vehicleId, orderId: s.orderId, outletId: s.outletId, skuId: s.skuId, name: s.name, planned: s.planned,
        loaded: s.loaded, kind: s.kind, decision: s.decision, photo: s.photo, photoIds: nn(s.photoIds), by: s.by, at: s.at, resolution: nn(s.resolution), resolvedBy: nn(s.resolvedBy),
      })),
  },
  {
    table: t.stopRecords,
    keys: ["orderId"],
    rows: (d) =>
      Object.values(d.stops).map((s) => ({
        orderId: s.orderId, vehicleId: s.vehicleId, arrivedAt: nn(s.arrivedAt), deliveredAt: nn(s.deliveredAt), pod: nn(s.pod), problem: nn(s.problem), recordedAt: s.recordedAt, syncedAt: s.syncedAt,
      })),
  },
  { table: t.driverEvents, keys: ["id"], insertOnly: true, rows: (d) => d.processedEventIds.map((id) => ({ id })) },
  {
    table: t.receipts,
    keys: ["orderId"],
    rows: (d) => Object.values(d.receipts).map((r) => ({ orderId: r.orderId, confirmedAt: r.confirmedAt, by: r.by, lines: r.lines, issues: r.issues, photoIds: nn(r.photoIds) })),
  },
  {
    table: t.notices,
    keys: ["id"],
    newestFirst: true,
    rows: (d) => d.notices.map((n) => ({ id: n.id, outletId: n.outletId, orderId: nn(n.orderId), kind: n.kind, title: n.title, body: n.body, at: n.at, acknowledged: nn(n.acknowledged), lateMin: nn(n.lateMin) })),
  },
  {
    table: t.exceptions,
    keys: ["id"],
    newestFirst: true,
    rows: (d) => d.exceptions.map((e) => ({ id: e.id, depotId: e.depot, kind: e.kind, severity: e.severity, title: e.title, body: e.body, at: e.at, ref: e.ref, resolved: !!e.resolved })),
  },
  {
    table: t.driverSync,
    keys: ["vehicleId"],
    rows: (d) =>
      Object.entries(d.driverSync).map(([vehicleId, s]) => ({ vehicleId, lastSyncAt: s.lastSyncAt, lastPlanVersion: s.lastPlanVersion, position: nn(s.position), trail: nn(s.trail), syncCheck: nn(s.check) })),
  },
  {
    table: t.driverConnectivity,
    keys: ["id"],
    newestFirst: true,
    insertOnly: true,
    rows: (d) => d.connectivity.map((c) => ({ id: c.id, vehicleId: c.vehicleId, state: c.state, at: c.at, receivedAt: c.receivedAt })),
  },
  { table: t.photos, keys: ["id"], readOnly: true, rows: (d) => Object.keys(d.photos).map((id) => ({ id })) },
  {
    table: t.deferralLog,
    keys: ["id"],
    newestFirst: true,
    rows: (d) =>
      d.deferralLog.map((x) => ({
        id: x.id, orderId: x.orderId, date: x.date, outletId: x.outletId, brand: x.brand, temp: x.temp, volumeM3: x.volumeM3, code: x.code, reason: x.reason, decidedBy: x.decidedBy, storeNotified: x.storeNotified,
      })),
  },
];

function plansOf(d: OpsDb): Plan[] {
  return DEPOTS.map((k) => d.plans[k]).filter((p): p is Plan => !!p);
}

/** Canonical JSON so that key order and undefined/null never register as a change. */
function canon(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k] ?? null])) : (x ?? null)));
}

function keyOf(p: Projection, r: Row) {
  return p.keys.map((k) => String(r[k])).join("\u0000");
}

function where(p: Projection, r: Row): SQL {
  const cols = p.table as unknown as Record<string, PgColumn>;
  return and(...p.keys.map((k) => eq(cols[k], r[k])))!;
}

/** Writes the difference between two states. Returns how many rows changed (for the audit detail). */
export async function persist(tx: Tx, prev: OpsDb, next: OpsDb): Promise<number> {
  const plan = PROJECTIONS.map((p) => {
    const a = new Map(p.rows(prev).map((r) => [keyOf(p, r), r]));
    const b = new Map(p.rows(next).map((r) => [keyOf(p, r), r]));
    return { p, a, b };
  });
  let changed = 0;
  for (const { p, a, b } of [...plan].reverse()) {
    if (p.updateOnly || p.insertOnly || p.readOnly) continue;
    for (const [k, r] of a) {
      if (b.has(k)) continue;
      await tx.delete(p.table).where(where(p, r));
      changed++;
    }
  }
  for (const { p, a, b } of plan) {
    if (p.readOnly) continue;
    const inserts: Row[] = [];
    for (const [k, r] of b) {
      const old = a.get(k);
      if (!old) {
        if (!p.updateOnly) inserts.push(r);
        continue;
      }
      if (p.insertOnly || canon(old) === canon(r)) continue;
      const set = Object.fromEntries(Object.entries(r).filter(([f]) => !p.keys.includes(f)));
      const hit = await tx.update(p.table).set(set).where(where(p, r)).returning({ one: sql`1` });
      // Rows the state fills from defaults (e.g. a depot's day before orders close) may not exist yet.
      if (!hit.length && !p.updateOnly) inserts.push(r);
      else changed++;
    }
    if (p.newestFirst) inserts.reverse();
    for (let i = 0; i < inserts.length; i += 200) await tx.insert(p.table).values(inserts.slice(i, i + 200));
    changed += inserts.length;
  }
  return changed;
}

/** Postgres returns "2026-09-26 06:25:25.897+00"; the app speaks ISO-8601. */
export function iso(v: string | null | undefined): string | undefined {
  if (!v) return undefined;
  const d = new Date(v.includes("T") ? v : v.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
  return Number.isNaN(d.getTime()) ? v : d.toISOString();
}
const u = <T,>(v: T | null): T | undefined => (v === null ? undefined : v);

/** Reads the whole operational state from the database. */
export async function loadOps(db: Tx): Promise<OpsDb> {
  const [vehicles, orders, lines, days, plans, trips, stops, deferrals, loads, loadLines, shortfalls, stopRecords, events, receipts, notices, exceptions, sync, log, photoRows, links] = await Promise.all([
    db.select({ id: t.vehicles.id, status: t.vehicles.status }).from(t.vehicles),
    db.select().from(t.orders).orderBy(asc(t.orders.createdAt), asc(t.orders.id)),
    db.select().from(t.orderLines).orderBy(asc(t.orderLines.orderId), asc(t.orderLines.position)),
    db.select().from(t.opsDays),
    db.select().from(t.plans),
    db.select().from(t.trips).orderBy(asc(t.trips.position)),
    db.select().from(t.tripStops).orderBy(asc(t.tripStops.tripId), asc(t.tripStops.seq)),
    db.select().from(t.planDeferrals).orderBy(asc(t.planDeferrals.position)),
    db.select().from(t.loads),
    db.select().from(t.loadLines),
    db.select().from(t.shortfalls).orderBy(desc(t.shortfalls.seq)),
    db.select().from(t.stopRecords),
    db.select({ id: t.driverEvents.id }).from(t.driverEvents).orderBy(asc(t.driverEvents.seq)),
    db.select().from(t.receipts),
    db.select().from(t.notices).orderBy(desc(t.notices.seq)),
    db.select().from(t.exceptions).orderBy(desc(t.exceptions.seq)),
    db.select().from(t.driverSync),
    db.select().from(t.deferralLog).orderBy(desc(t.deferralLog.seq)),
    db
      .select({ id: t.photos.id, kind: t.photos.kind, orderId: t.photos.orderId, vehicleId: t.photos.vehicleId, contentType: t.photos.contentType, bytes: t.photos.bytes, by: t.photos.by, at: t.photos.at })
      .from(t.photos),
    db.select().from(t.driverConnectivity).orderBy(desc(t.driverConnectivity.seq)),
  ]);

  const linesBy = new Map<string, Order["lines"]>();
  for (const l of lines) linesBy.set(l.orderId, [...(linesBy.get(l.orderId) ?? []), { skuId: l.skuId, name: l.name, unit: l.unit, qty: l.qty }]);
  // Seeded orders have no created_at; keep them in id order ahead of orders placed in the app.
  const ordered = [...orders].sort((a, b) => (a.createdAt ? 1 : 0) - (b.createdAt ? 1 : 0) || (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id));

  const stopsBy = new Map<string, string[]>();
  for (const s of stops) stopsBy.set(s.tripId, [...(stopsBy.get(s.tripId) ?? []), s.orderId]);
  const linesOfLoad = new Map<string, LoadCheck["lines"]>();
  for (const l of loadLines) linesOfLoad.set(l.tripId, { ...(linesOfLoad.get(l.tripId) ?? {}), [l.lineKey]: { planned: l.planned, loaded: l.loaded } });

  const planOf = (depot: Depot): Plan | null => {
    const p = plans.find((x) => x.depotId === depot);
    if (!p) return null;
    return {
      date: p.date, depot, version: p.version, status: p.status as Plan["status"], publishedAt: iso(p.publishedAt),
      trips: trips.filter((x) => x.depotId === depot).map((x) => ({ id: x.id, vehicleId: x.vehicleId, tripNo: x.tripNo as 1 | 2, brand: x.brand as Order["brand"], district: x.district, orderIds: stopsBy.get(x.id) ?? [] })),
      deferred: deferrals.filter((x) => x.depotId === depot).map((x) => ({ orderId: x.orderId, code: x.code as Plan["deferred"][number]["code"], reason: x.reason, note: u(x.note), decidedBy: x.decidedBy, decidedAt: x.decidedAt })),
    };
  };

  return {
    schema: 3,
    orders: ordered.map((o) => ({
      id: o.id, outletId: o.outletId, depot: o.depotId as Depot, brand: o.brand as Order["brand"], temp: o.temp as Order["temp"], units: o.units, weightKg: o.weightKg, volumeM3: o.volumeM3,
      deferredYesterday: o.deferredYesterday, daysSinceLastServed: o.daysSinceLastServed, source: o.source, forDate: u(o.forDate), createdAt: iso(o.createdAt), createdBy: u(o.createdBy), lines: linesBy.get(o.id),
      confirmCode: u(o.confirmCode),
    })),
    day: Object.fromEntries(DEPOTS.map((k) => {
      const d = days.find((x) => x.depotId === k);
      return [k, d ? { ordersClosed: d.ordersClosed, closedAt: iso(d.closedAt), closedBy: u(d.closedBy) } : { ordersClosed: false }];
    })) as OpsDb["day"],
    plans: { Peliyagoda: planOf("Peliyagoda"), Kandy: planOf("Kandy") },
    fleetStatus: Object.fromEntries(vehicles.map((v) => [v.id, v.status])),
    loads: Object.fromEntries(loads.map((l) => [l.tripId, {
      tripId: l.tripId, vehicleId: l.vehicleId, planVersion: l.planVersion, changedVersion: u(l.changedVersion), lines: linesOfLoad.get(l.tripId) ?? {},
      status: l.status as LoadCheck["status"], releasedAt: iso(l.releasedAt), releasedBy: u(l.releasedBy),
    }])),
    shortfalls: shortfalls.map((s): Shortfall => ({
      id: s.id, tripId: s.tripId, vehicleId: s.vehicleId, orderId: s.orderId, outletId: s.outletId, skuId: s.skuId, name: s.name, planned: s.planned, loaded: s.loaded,
      kind: s.kind as Shortfall["kind"], decision: s.decision as Shortfall["decision"], photo: s.photo, photoIds: u(s.photoIds) as string[] | undefined, by: s.by, at: iso(s.at)!, resolution: u(s.resolution) as Shortfall["resolution"], resolvedBy: u(s.resolvedBy),
    })),
    stops: Object.fromEntries(stopRecords.map((s) => [s.orderId, {
      orderId: s.orderId, vehicleId: s.vehicleId, arrivedAt: u(s.arrivedAt), deliveredAt: u(s.deliveredAt), pod: u(s.pod) as StopRecord["pod"], problem: u(s.problem) as StopRecord["problem"],
      recordedAt: iso(s.recordedAt)!, syncedAt: iso(s.syncedAt)!,
    }])),
    receipts: Object.fromEntries(receipts.map((r) => [r.orderId, { orderId: r.orderId, confirmedAt: iso(r.confirmedAt)!, by: r.by, lines: r.lines as Receipt["lines"], issues: r.issues as Receipt["issues"], photoIds: u(r.photoIds) as string[] | undefined }])),
    notices: notices.map((n): Notice => ({ id: n.id, outletId: n.outletId, orderId: u(n.orderId), kind: n.kind as Notice["kind"], title: n.title, body: n.body, at: iso(n.at)!, acknowledged: u(n.acknowledged) as Notice["acknowledged"], lateMin: u(n.lateMin) })),
    exceptions: exceptions.map((e): DispatchException => ({
      id: e.id, depot: e.depotId as Depot, kind: e.kind as DispatchException["kind"], severity: e.severity as DispatchException["severity"], title: e.title, body: e.body, at: iso(e.at)!,
      ref: e.ref as DispatchException["ref"], resolved: e.resolved || undefined,
    })),
    driverSync: Object.fromEntries(sync.map((s): [string, DriverSyncState] => [s.vehicleId, {
      lastSyncAt: iso(s.lastSyncAt)!, lastPlanVersion: s.lastPlanVersion,
      position: u(s.position) as DriverSyncState["position"], trail: u(s.trail) as DriverSyncState["trail"], check: u(s.syncCheck) as DriverSyncState["check"],
    }])),
    processedEventIds: events.map((e) => e.id),
    deferralLog: log.map((x) => ({
      id: x.id, orderId: x.orderId, date: x.date, outletId: x.outletId, brand: x.brand, temp: x.temp, volumeM3: x.volumeM3, code: x.code as OpsDb["deferralLog"][number]["code"],
      reason: x.reason, decidedBy: x.decidedBy, storeNotified: x.storeNotified,
    })),
    photos: Object.fromEntries(photoRows.map((p): [string, PhotoMeta] => [p.id, {
      id: p.id, kind: p.kind as PhotoMeta["kind"], orderId: p.orderId, vehicleId: u(p.vehicleId), contentType: p.contentType, bytes: p.bytes, by: p.by, at: iso(p.at)!,
    }])),
    connectivity: links.map((c): ConnectivityEvent => ({ id: c.id, vehicleId: c.vehicleId, state: c.state as ConnectivityEvent["state"], at: iso(c.at)!, receivedAt: iso(c.receivedAt)! })),
  };
}

/** An empty state, the "before" side when seeding a fresh database. */
export function emptyOps(fleetStatus: OpsDb["fleetStatus"]): OpsDb {
  return {
    schema: 3, orders: [], day: { Peliyagoda: { ordersClosed: false }, Kandy: { ordersClosed: false } }, plans: { Peliyagoda: null, Kandy: null },
    fleetStatus, loads: {}, shortfalls: [], stops: {}, receipts: {}, notices: [], exceptions: [], driverSync: {}, processedEventIds: [], deferralLog: [], photos: {}, connectivity: [],
  };
}
