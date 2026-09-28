import type { Deferral, DeferralCode, Depot, Order, Plan, Trip, Vehicle } from "../domain/types";
import {
  evaluateVehicle,
  sequence,
  vehicleViolations,
  FRESH_BUDGET_MIN,
  legMinutes,
  tripMinutes,
  type EvalContext,
  type RuleCode,
  type Violation,
} from "./evaluate";
import { priority } from "./priority";

export const DEFERRAL_TEXT: Record<DeferralCode, string> = {
  REEFER_CAPACITY: "All available refrigerated vehicles are full or out of Fresh-window time.",
  VAN_CAPACITY: "Van-only outlet, and every available van is full.",
  FRESH_WINDOW: "No vehicle can reach this outlet inside its delivery window (Fresh runs 03:30–08:00).",
  DAY_BUDGET: "No vehicle has Style/Tech driving time left today.",
  MALL_WINDOW: "No trip can reach the mall bay inside its fixed access window.",
  FUEL_QUOTA: "Remaining vehicles would exceed their weekly fuel quota.",
  CAPACITY: "No vehicle has enough weight or volume left for this district.",
  OVERSIZE: "The order is larger than any available vehicle can carry in one trip; it must be split by the store.",
  NO_VEHICLE: "No available vehicle at this depot can serve this outlet.",
  MANUAL: "Deferred by the dispatcher.",
};

const now = () => new Date().toISOString();

function renumber(trips: Trip[]): Trip[] {
  const byVehicle = new Map<string, Trip[]>();
  for (const t of trips) byVehicle.set(t.vehicleId, [...(byVehicle.get(t.vehicleId) ?? []), t]);
  return trips.map((t) => {
    const mine = byVehicle.get(t.vehicleId)!.sort((a, b) => a.tripNo - b.tripNo);
    return { ...t, tripNo: (mine.indexOf(t) + 1) as 1 | 2 };
  });
}

function nextTripNo(trips: Trip[], vehicleId: string): 1 | 2 {
  return (trips.filter((t) => t.vehicleId === vehicleId).length + 1) as 1 | 2;
}

/** Why an order could not be placed, judged from the rules that blocked each candidate. */
function diagnose(order: Order, blocked: RuleCode[], ctx: EvalContext): DeferralCode {
  const outlet = ctx.net.outlets.get(order.outletId)!;
  const count = (c: RuleCode) => blocked.filter((b) => b === c).length;
  if (!blocked.length) return "NO_VEHICLE";
  if (count("MALL_WINDOW")) return "MALL_WINDOW";
  const fresh = count("FRESH_BUDGET") + count("WINDOW"), day = count("DAY_BUDGET"), fuel = count("FUEL_QUOTA");
  const cap = count("VOLUME") + count("WEIGHT") + count("MAX_TRIPS");
  if (order.temp === "chilled") return fresh > cap ? "FRESH_WINDOW" : "REEFER_CAPACITY";
  if (outlet.parking === "van_only") return "VAN_CAPACITY";
  if (fuel > cap && fuel >= fresh) return "FUEL_QUOTA";
  if (fresh > cap) return "FRESH_WINDOW";
  if (day > cap) return "DAY_BUDGET";
  return "CAPACITY";
}

/** Rules that can never be satisfied by this vehicle, whatever else is on it. */
const STRUCTURAL: RuleCode[] = ["REEFER", "VAN_ONLY", "HOME_DEPOT", "UNAVAILABLE", "BRAND_DISTRICT"];

export interface AutoPlanInput {
  date: string;
  depot: Depot;
  orders: Order[];
  ctx: EvalContext;
  festivalRamp: number;
  version?: number;
}

/**
 * Explainable slot-packing allocation.
 *
 * Scarce vehicles are planned first, in four pools (each split so that outlets skipped yesterday go first):
 *   1. chilled + van-only  → refrigerated vans
 *   2. chilled             → refrigerated vehicles
 *   3. ambient + van-only  → vans
 *   4. everything else     → any vehicle (reefers and vans discouraged)
 *
 * Within a pool we repeatedly commit the single best "slot": extending an existing trip, or opening
 * a new trip on a vehicle, filled with the pool's highest-priority orders for one brand + district.
 * "Best" = priority served per minute of vehicle time, because minutes are what runs out in the
 * 03:30–08:00 Fresh window: a short Colombo trip carrying eight orders beats a three-hour trip
 * carrying one. Orders left over are deferred with the rule that blocked them.
 */
export function autoPlan({ date, depot, orders, ctx, festivalRamp, version = 1 }: AutoPlanInput): Plan {
  const { net } = ctx;
  let trips: Trip[] = [];
  const deferred: Deferral[] = [];
  let seq = 0;
  const newId = () => `${depot[0]}${date.replaceAll("-", "").slice(2)}-T${String(++seq).padStart(2, "0")}`;
  const defer = (orderId: string, code: DeferralCode) =>
    deferred.push({ orderId, code, reason: DEFERRAL_TEXT[code], decidedBy: "Auto-plan", decidedAt: now() });

  const vehicles = [...net.vehicles.values()].filter((v) => v.depot === depot && ctx.available.has(v.id));
  const score = new Map(orders.map((o) => [o.id, priority(o, net, festivalRamp).total]));
  const vanOnly = (o: Order) => net.outlets.get(o.outletId)!.parking === "van_only";
  const byPriority = (a: Order, b: Order) => score.get(b.id)! - score.get(a.id)! || b.volumeM3 - a.volumeM3;
  const feasible = (vid: string, cand: Trip[]) => !vehicleViolations(evaluateVehicle(vid, cand, ctx)).length;

  const maxVol = Math.max(0, ...vehicles.map((v) => v.volumeCapM3));
  const maxKg = Math.max(0, ...vehicles.map((v) => v.weightCapKg));
  const rest: Order[] = [];
  for (const o of orders) {
    if (o.volumeM3 > maxVol || o.weightKg > maxKg) defer(o.id, "OVERSIZE");
    else rest.push(o);
  }

  // Fairness first: within each pool, outlets skipped on the previous run are placed before anyone else.
  const scarcePools: [(o: Order) => boolean, (v: Vehicle) => boolean][] = [
    [(o) => o.temp === "chilled" && vanOnly(o), (v) => v.type === "van" && v.temp === "reefer"],
    [(o) => o.temp === "chilled" && !vanOnly(o), (v) => v.temp === "reefer"],
    [(o) => o.temp === "ambient" && vanOnly(o), (v) => v.type === "van"],
    [(o) => o.temp === "ambient" && !vanOnly(o), () => true],
  ];
  const pools: [Order[], (v: Vehicle) => boolean][] = scarcePools.flatMap(([inPool, allowed]) => [
    [rest.filter((o) => inPool(o) && o.deferredYesterday), allowed],
    [rest.filter((o) => inPool(o) && !o.deferredYesterday), allowed],
  ] as [Order[], (v: Vehicle) => boolean][]);
  const penalty = (v: Vehicle, added: Order[]) =>
    (v.temp === "reefer" && added.every((o) => o.temp === "ambient") ? 0.3 : 1) * (v.type === "van" && !added.some(vanOnly) ? 0.4 : 1);

  for (const [pool, allowed] of pools) {
    let left = [...pool].sort(byPriority);
    const fleet = vehicles.filter(allowed);
    while (left.length) {
      let best: { density: number; trips: Trip[]; added: string[] } | null = null;
      const buckets = new Map<string, Order[]>();
      for (const o of left) {
        const k = `${o.brand}|${net.outlets.get(o.outletId)!.district}`;
        buckets.set(k, [...(buckets.get(k) ?? []), o]);
      }
      for (const [key, bucket] of buckets) {
        const [brand, district] = key.split("|") as [Trip["brand"], string];
        const outbound = legMinutes(district, ctx).outbound;
        const seen = new Set<string>();
        const slots: { trip: Trip; isNew: boolean }[] = [
          ...trips.filter((t) => t.brand === brand && t.district === district && allowed(net.vehicles.get(t.vehicleId)!)).map((trip) => ({ trip, isNew: false })),
          ...fleet
            .filter((v) => trips.filter((t) => t.vehicleId === v.id).length < 2)
            .filter((v) => {
              // identical idle vehicles give identical results; try one of each kind
              if (trips.some((t) => t.vehicleId === v.id)) return true;
              const sig = [v.type, v.temp, v.volumeCapM3, v.weightCapKg, v.kmPerL, Math.round((v.weeklyFuelQuotaL - (ctx.fuelUsedL.get(v.id) ?? 0)) / 20)].join();
              return !seen.has(sig) && !!seen.add(sig);
            })
            .map((v) => ({ trip: { id: "new", vehicleId: v.id, tripNo: nextTripNo(trips, v.id), brand, district, orderIds: [] } as Trip, isNew: true })),
        ];
        for (const { trip, isNew } of slots) {
          const v = net.vehicles.get(trip.vehicleId)!;
          let cur = trip;
          let curTrips = isNew ? [...trips, trip] : trips;
          const added: Order[] = [];
          for (const o of bucket) {
            if (vanOnly(o) && v.type !== "van") continue;
            if (o.temp === "chilled" && v.temp !== "reefer") continue;
            const next: Trip = { ...cur, orderIds: sequence([...cur.orderIds, o.id], ctx) };
            const nextTrips = curTrips.map((t) => (t === cur ? next : t));
            if (feasible(v.id, nextTrips)) {
              cur = next;
              curTrips = nextTrips;
              added.push(o);
            }
          }
          if (!added.length) continue;
          const minutes = tripMinutes(cur, ctx) - (isNew ? 0 : tripMinutes(trip, ctx)) + (isNew ? outbound : 0);
          const density = (added.reduce((s, o) => s + score.get(o.id)!, 0) / Math.max(minutes, 1)) * penalty(v, added);
          if (!best || density > best.density) best = { density, trips: curTrips, added: added.map((o) => o.id) };
        }
      }
      const chosen = best as { density: number; trips: Trip[]; added: string[] } | null;
      if (!chosen) break;
      trips = chosen.trips.map((t) => (t.id === "new" ? { ...t, id: newId() } : t));
      left = left.filter((o) => !chosen.added.includes(o.id));
    }

    // Anything left in this pool could not be placed: record the rule that blocked it.
    for (const o of left) {
      const outlet = net.outlets.get(o.outletId)!;
      const blocked: RuleCode[] = [];
      for (const v of fleet) {
        const mine = trips.filter((t) => t.vehicleId === v.id);
        for (const t of mine.filter((t) => t.brand === o.brand && t.district === outlet.district)) {
          const cand = trips.map((x) => (x === t ? { ...t, orderIds: sequence([...t.orderIds, o.id], ctx) } : x));
          const viol = vehicleViolations(evaluateVehicle(v.id, cand, ctx)).filter((x) => !STRUCTURAL.includes(x.code));
          blocked.push(...viol.map((x) => x.code));
        }
        if (mine.length >= 2) {
          blocked.push("MAX_TRIPS");
          continue;
        }
        const cand = [...trips, { id: "probe", vehicleId: v.id, tripNo: nextTripNo(trips, v.id), brand: o.brand, district: outlet.district, orderIds: [o.id] } as Trip];
        blocked.push(...vehicleViolations(evaluateVehicle(v.id, cand, ctx)).filter((x) => !STRUCTURAL.includes(x.code)).map((x) => x.code));
      }
      defer(o.id, fleet.length ? diagnose(o, blocked, ctx) : "NO_VEHICLE");
    }
  }
  return { date, depot, version, status: "draft", trips: runOrder(renumber(trips), ctx), deferred };
}

/** Stores trip numbers in the order the evaluator actually runs them. */
function runOrder(trips: Trip[], ctx: EvalContext): Trip[] {
  const no = new Map<string, 1 | 2>();
  for (const vid of new Set(trips.map((t) => t.vehicleId))) for (const e of evaluateVehicle(vid, trips, ctx).trips) no.set(e.trip.id, e.trip.tripNo);
  return trips.map((t) => ({ ...t, tripNo: no.get(t.id) ?? t.tripNo }));
}

// ---------------------------------------------------------------- manual moves

export type MoveTarget = { tripId: string } | { newTripOn: string } | { defer: true; code?: DeferralCode; note?: string; by: string };

export interface MoveResult {
  plan: Plan;
  ok: boolean;
  violations: Violation[];
  warnings: string[];
}

/** Applies a dispatcher move and validates the vehicles it touches. Rejected moves return the original plan. */
export function moveOrder(plan: Plan, orderId: string, target: MoveTarget, ctx: EvalContext): MoveResult {
  const order = ctx.orders.get(orderId)!;
  const outlet = ctx.net.outlets.get(order.outletId)!;
  const from = plan.trips.find((t) => t.orderIds.includes(orderId));
  let trips = plan.trips
    .map((t) => (t === from ? { ...t, orderIds: t.orderIds.filter((id) => id !== orderId) } : t))
    .filter((t) => t.orderIds.length > 0);
  trips = renumber(trips);
  let deferred = plan.deferred.filter((d) => d.orderId !== orderId);

  let touched: string | null = null;
  if ("defer" in target) {
    const code = target.code ?? "MANUAL";
    deferred = [...deferred, { orderId, code, reason: DEFERRAL_TEXT[code], note: target.note, decidedBy: target.by, decidedAt: now() }];
  } else if ("tripId" in target) {
    const to = trips.find((t) => t.id === target.tripId);
    if (!to) return { plan, ok: false, violations: [{ code: "BRAND_DISTRICT", message: "That trip no longer exists." }], warnings: [] };
    trips = trips.map((t) => (t.id === to.id ? { ...t, orderIds: sequence([...t.orderIds, orderId], ctx) } : t));
    touched = to.vehicleId;
  } else {
    const vid = target.newTripOn;
    const id = `${plan.depot[0]}M-${Date.now().toString(36)}`;
    trips = [...trips, { id, vehicleId: vid, tripNo: nextTripNo(trips, vid), brand: order.brand, district: outlet.district, orderIds: [orderId] }];
    touched = vid;
  }

  const next: Plan = { ...plan, trips: runOrder(trips, ctx), deferred, status: "draft" };
  if (!touched) return { plan: next, ok: true, violations: [], warnings: [] };
  const ev = evaluateVehicle(touched, trips, ctx);
  const violations = vehicleViolations(ev);
  const warnings = ev.trips.flatMap((t) => t.warnings);
  return violations.length ? { plan, ok: false, violations, warnings } : { plan: next, ok: true, violations: [], warnings };
}

// ---------------------------------------------------------------- suggestions

export interface Suggestion {
  kind: "insert" | "swap" | "newTrip";
  tripId: string;
  vehicleId: string;
  removeOrderId?: string;
  gain: number;
}

/** For a deferred order: a feasible direct insert, or the best swap with a lower-priority served order. */
export function suggestFor(plan: Plan, orderId: string, ctx: EvalContext, festivalRamp: number): Suggestion | null {
  const order = ctx.orders.get(orderId)!;
  const outlet = ctx.net.outlets.get(order.outletId)!;
  const s = (id: string) => priority(ctx.orders.get(id)!, ctx.net, festivalRamp).total;
  const mine = s(orderId);
  let best: Suggestion | null = null;
  for (const trip of plan.trips) {
    if (trip.brand !== order.brand || trip.district !== outlet.district) continue;
    const tryTrips = (ids: string[]) => {
      const t2 = { ...trip, orderIds: sequence(ids, ctx) };
      return !vehicleViolations(evaluateVehicle(trip.vehicleId, plan.trips.map((t) => (t.id === trip.id ? t2 : t)), ctx)).length;
    };
    if (tryTrips([...trip.orderIds, orderId])) return { kind: "insert", tripId: trip.id, vehicleId: trip.vehicleId, gain: mine };
    for (const other of trip.orderIds) {
      const gain = mine - s(other);
      if (gain <= 0 || (best && gain <= best.gain)) continue;
      if (tryTrips([...trip.orderIds.filter((x) => x !== other), orderId]))
        best = { kind: "swap", tripId: trip.id, vehicleId: trip.vehicleId, removeOrderId: other, gain };
    }
  }
  if (best) return best;
  // Otherwise: a vehicle with a free trip slot that could run this order on its own.
  for (const v of ctx.net.vehicles.values()) {
    if (v.depot !== plan.depot || !ctx.available.has(v.id) || plan.trips.filter((t) => t.vehicleId === v.id).length >= 2) continue;
    const probe: Trip = { id: "probe", vehicleId: v.id, tripNo: 2, brand: order.brand, district: outlet.district, orderIds: [orderId] };
    const trips = renumber([...plan.trips, probe]);
    if (!vehicleViolations(evaluateVehicle(v.id, trips, ctx)).length) return { kind: "newTrip", tripId: "", vehicleId: v.id, gain: mine };
  }
  return null;
}

// ---------------------------------------------------------------- whole-plan checks & metrics

/** Independent re-check of every Task 2B feasibility rule, used before publishing and in tests. */
export function validatePlan(plan: Plan, orders: Order[], ctx: EvalContext): Violation[] {
  const v: Violation[] = [];
  const seen = new Map<string, number>();
  for (const t of plan.trips) for (const id of t.orderIds) seen.set(id, (seen.get(id) ?? 0) + 1);
  for (const d of plan.deferred) seen.set(d.orderId, (seen.get(d.orderId) ?? 0) + 1);
  for (const o of orders) {
    const n = seen.get(o.id) ?? 0;
    if (n !== 1) v.push({ code: "BRAND_DISTRICT", message: `${o.id} appears ${n} times (must be served once or deferred).` });
  }
  const vids = [...new Set(plan.trips.map((t) => t.vehicleId))];
  for (const vid of vids) v.push(...vehicleViolations(evaluateVehicle(vid, plan.trips, ctx)));
  return v;
}

export interface PlanMetrics {
  orders: number;
  served: number;
  deferred: number;
  chilledDemandM3: number;
  reeferCapacityM3: number;
  reeferPressure: number; // demand / capacity (0..n)
  freshMinutesAvg: number;
  freshBudget: number;
  dryUtil: number; // share of ambient-vehicle capacity used on planned trips
  vanOnlyServed: number;
  vanOnlyTotal: number;
  fuelWeekPct: number;
  worstFuel: { vehicleId: string; pct: number } | null;
  bindingConstraint: "reefer" | "fresh-window" | "vans" | "fuel" | "none";
}

export function planMetrics(plan: Plan, orders: Order[], ctx: EvalContext): PlanMetrics {
  const { net } = ctx;
  const depotVehicles = [...net.vehicles.values()].filter((v) => v.depot === plan.depot && ctx.available.has(v.id));
  const reefers = depotVehicles.filter((v) => v.temp === "reefer");
  const chilledDemandM3 = orders.filter((o) => o.temp === "chilled").reduce((s, o) => s + o.volumeM3, 0);
  const reeferCapacityM3 = reefers.reduce((s, v) => s + v.volumeCapM3 * 2, 0);
  const evals = depotVehicles.map((v) => evaluateVehicle(v.id, plan.trips, ctx));
  const usedReefers = evals.filter((e) => e.vehicle.temp === "reefer" && e.trips.length);
  const freshMinutesAvg = usedReefers.length ? usedReefers.reduce((s, e) => s + e.freshMinutes, 0) / usedReefers.length : 0;
  const ambientTrips = evals.filter((e) => e.vehicle.temp === "ambient").flatMap((e) => e.trips);
  const dryUtil = ambientTrips.length ? ambientTrips.reduce((s, t) => s + t.volumeM3, 0) / ambientTrips.reduce((s, t) => s + t.vehicle.volumeCapM3, 0) : 0;
  const vanOnly = orders.filter((o) => net.outlets.get(o.outletId)!.parking === "van_only");
  const deferredIds = new Set(plan.deferred.map((d) => d.orderId));
  const quota = depotVehicles.reduce((s, v) => s + v.weeklyFuelQuotaL, 0);
  const used = evals.reduce((s, e) => s + e.fuelWeekL, 0);
  const worst = evals.map((e) => ({ vehicleId: e.vehicle.id, pct: e.fuelWeekL / e.vehicle.weeklyFuelQuotaL })).sort((a, b) => b.pct - a.pct)[0] ?? null;
  const reeferPressure = reeferCapacityM3 ? chilledDemandM3 / reeferCapacityM3 : 0;
  const codes = plan.deferred.map((d) => d.code);
  const most = (c: DeferralCode) => codes.filter((x) => x === c).length;
  const bindingConstraint =
    !codes.length ? "none"
    : most("REEFER_CAPACITY") >= Math.max(most("FRESH_WINDOW"), most("VAN_CAPACITY"), most("FUEL_QUOTA")) ? "reefer"
    : most("FRESH_WINDOW") >= Math.max(most("VAN_CAPACITY"), most("FUEL_QUOTA")) ? "fresh-window"
    : most("VAN_CAPACITY") >= most("FUEL_QUOTA") ? "vans" : "fuel";
  return {
    orders: orders.length,
    served: orders.length - deferredIds.size,
    deferred: deferredIds.size,
    chilledDemandM3,
    reeferCapacityM3,
    reeferPressure,
    freshMinutesAvg,
    freshBudget: FRESH_BUDGET_MIN,
    dryUtil,
    vanOnlyServed: vanOnly.filter((o) => !deferredIds.has(o.id)).length,
    vanOnlyTotal: vanOnly.length,
    fuelWeekPct: quota ? used / quota : 0,
    worstFuel: worst,
    bindingConstraint,
  };
}
