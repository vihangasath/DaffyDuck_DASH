import type { Network, Order, Trip, Vehicle } from "../domain/types";
import { fmtMin, parseWindow, toMin } from "../domain/time";

/** Operating windows and budgets from the brief (Task 2B / operating constraints). */
export const FRESH_START = toMin("03:30");
export const FRESH_BUDGET_MIN = 270; // 03:30–08:00
export const DAY_START = toMin("08:00");
export const DAY_BUDGET_MIN = 480; // Style + Tech combined
export const MAX_TRIPS = 2;

export type RuleCode =
  | "BRAND_DISTRICT"
  | "REEFER"
  | "VAN_ONLY"
  | "HOME_DEPOT"
  | "UNAVAILABLE"
  | "WEIGHT"
  | "VOLUME"
  | "MAX_TRIPS"
  | "FRESH_BUDGET"
  | "DAY_BUDGET"
  | "MALL_WINDOW"
  | "WINDOW"
  | "FUEL_QUOTA";

export interface Violation {
  code: RuleCode;
  message: string;
}

export interface StopEta {
  orderId: string;
  outletId: string;
  seq: number;
  arrive: number; // minutes after midnight
  start: number; // service start (after waiting for the window)
  leave: number;
  late: boolean;
}

export interface TripEval {
  trip: Trip;
  vehicle: Vehicle;
  orders: Order[];
  volumeM3: number;
  weightKg: number;
  /** Budget minutes per Task 2B: outbound + inter-stop + handling (no return leg). */
  minutes: number;
  km: number;
  fuelL: number;
  /** The district's road disruption index for the plan date (100 = normal); legs take 100/index as long. */
  disruptionIndex: number;
  depart: number;
  finish: number;
  returnAt: number;
  stops: StopEta[];
  violations: Violation[];
  warnings: string[];
}

export interface VehicleDayEval {
  vehicle: Vehicle;
  trips: TripEval[];
  freshMinutes: number;
  dayMinutes: number;
  fuelTodayL: number;
  fuelWeekL: number;
  violations: Violation[];
}

export interface EvalContext {
  net: Network;
  orders: Map<string, Order>;
  available: Set<string>;
  /** Litres already used this ISO week before the plan date. */
  fuelUsedL: Map<string, number>;
}

const isFresh = (t: Trip) => t.brand === "Fresh";

/** Delivery sequence: earliest-closing window first, then earliest opening. */
export function sequence(orderIds: string[], ctx: EvalContext): string[] {
  const key = (id: string) => {
    const o = ctx.net.outlets.get(ctx.orders.get(id)!.outletId)!;
    const close = o.mallWindow ? parseWindow(o.mallWindow)[1] : toMin(o.windowClose);
    return close * 10_000 + toMin(o.windowOpen);
  };
  return [...orderIds].sort((a, b) => key(a) - key(b));
}

/**
 * Leg minutes to and within a district on the plan date. The free-flow times are stretched by the day's
 * road disruption index (100 = normal, 80 = legs take 100/80 = 1.25× as long); in the route-leg history,
 * actual vs planned travel time tracks this ratio closely. Dock handling time is not affected.
 */
export function legMinutes(district: string, ctx: EvalContext) {
  const travel = ctx.net.travel.get(district)!;
  const index = Math.min(100, Math.max(10, ctx.net.disruption(district)));
  const factor = 100 / index;
  return { index, outbound: Math.round(travel.depotToDistrictMin * factor), interStop: Math.round(travel.interStopMin * factor) };
}

export function tripMinutes(trip: Trip, ctx: EvalContext): number {
  const legs = legMinutes(trip.district, ctx);
  const handling = trip.orderIds.reduce((s, id) => {
    const o = ctx.net.outlets.get(ctx.orders.get(id)!.outletId)!;
    return s + ctx.net.allowance(trip.brand, o.dockType);
  }, 0);
  return legs.outbound + legs.interStop * Math.max(0, trip.orderIds.length - 1) + handling;
}

/** Checks everything that can be judged from a single trip. */
export function evaluateTrip(trip: Trip, ctx: EvalContext, depart: number): TripEval {
  const vehicle = ctx.net.vehicles.get(trip.vehicleId)!;
  const travel = ctx.net.travel.get(trip.district)!;
  const legs = legMinutes(trip.district, ctx);
  const orders = trip.orderIds.map((id) => ctx.orders.get(id)!);
  const v: Violation[] = [];
  const warnings: string[] = [];

  for (const o of orders) {
    const outlet = ctx.net.outlets.get(o.outletId)!;
    if (o.brand !== trip.brand || outlet.district !== trip.district)
      v.push({ code: "BRAND_DISTRICT", message: `${o.outletId} is ${o.brand} · ${outlet.district}; a trip carries one brand to one district (${trip.brand} · ${trip.district}).` });
    if (o.temp === "chilled" && vehicle.temp !== "reefer")
      v.push({ code: "REEFER", message: `${o.outletId} is chilled — ${vehicle.id} is not refrigerated.` });
    if (outlet.parking === "van_only" && vehicle.type !== "van")
      v.push({ code: "VAN_ONLY", message: `${o.outletId} is van-only — ${vehicle.id} is a truck.` });
    if (outlet.depot !== vehicle.depot)
      v.push({ code: "HOME_DEPOT", message: `${o.outletId} belongs to ${outlet.depot}; ${vehicle.id} is based at ${vehicle.depot}.` });
  }
  if (!ctx.available.has(vehicle.id)) v.push({ code: "UNAVAILABLE", message: `${vehicle.id} is in the workshop.` });

  const volumeM3 = orders.reduce((s, o) => s + o.volumeM3, 0);
  const weightKg = orders.reduce((s, o) => s + o.weightKg, 0);
  if (volumeM3 > vehicle.volumeCapM3 + 1e-9)
    v.push({ code: "VOLUME", message: `Volume ${volumeM3.toFixed(1)} m³ exceeds ${vehicle.id}'s ${vehicle.volumeCapM3} m³.` });
  if (weightKg > vehicle.weightCapKg + 1e-9)
    v.push({ code: "WEIGHT", message: `Weight ${Math.round(weightKg)} kg exceeds ${vehicle.id}'s ${vehicle.weightCapKg} kg.` });

  // ETAs along the sequence
  const stops: StopEta[] = [];
  let t = depart + legs.outbound;
  trip.orderIds.forEach((id, i) => {
    const o = ctx.orders.get(id)!;
    const outlet = ctx.net.outlets.get(o.outletId)!;
    if (i > 0) t += legs.interStop;
    const [open, close] = outlet.mallWindow ? parseWindow(outlet.mallWindow) : [toMin(outlet.windowOpen), toMin(outlet.windowClose)];
    const arrive = t;
    const start = Math.max(arrive, open);
    const leave = start + ctx.net.allowance(trip.brand, outlet.dockType);
    const late = arrive > close;
    if (late && outlet.mallWindow)
      v.push({ code: "MALL_WINDOW", message: `${o.outletId} mall bay closes ${outlet.mallWindow.split("-")[1]}; arrival would be later.` });
    else if (late) v.push({ code: "WINDOW", message: `${o.outletId} would arrive ${fmtMin(arrive)}, after its window closes at ${outlet.windowClose}.` });
    stops.push({ orderId: id, outletId: o.outletId, seq: i, arrive, start, leave, late });
    t = leave;
  });

  const km = travel.depotToDistrictKm * 2 + travel.interStopKm * Math.max(0, orders.length - 1);
  return {
    trip,
    vehicle,
    orders,
    volumeM3,
    weightKg,
    minutes: tripMinutes(trip, ctx),
    km,
    fuelL: km / vehicle.kmPerL,
    disruptionIndex: legs.index,
    depart,
    finish: t,
    returnAt: t + legs.outbound,
    stops,
    violations: v,
    warnings,
  };
}

/** Evaluates all trips of one vehicle: departures, budgets, trip count, fuel. */
export function evaluateVehicle(vehicleId: string, trips: Trip[], ctx: EvalContext): VehicleDayEval {
  const vehicle = ctx.net.vehicles.get(vehicleId)!;
  const mine = trips.filter((t) => t.vehicleId === vehicleId).sort((a, b) => a.tripNo - b.tripNo);
  const run = (order: Trip[]) => {
    const out: TripEval[] = [];
    let freeAt = 0;
    order.forEach((trip, i) => {
      const earliest = isFresh(trip) ? FRESH_START : DAY_START;
      // Leave no earlier than needed to reach the first stop as its window opens (waiting at the kerb helps no one).
      const first = trip.orderIds[0] && ctx.net.outlets.get(ctx.orders.get(trip.orderIds[0])!.outletId)!;
      const open = first ? (first.mallWindow ? parseWindow(first.mallWindow)[0] : toMin(first.windowOpen)) : 0;
      const ideal = open - legMinutes(trip.district, ctx).outbound;
      const e = evaluateTrip({ ...trip, tripNo: (i + 1) as 1 | 2 }, ctx, Math.max(earliest, freeAt, ideal));
      out.push(e);
      freeAt = e.returnAt;
    });
    return out;
  };
  // With two trips in the same shift, run them in whichever order keeps more stops inside their windows.
  let evals = run(mine);
  if (mine.length === 2 && isFresh(mine[0]) === isFresh(mine[1])) {
    const swapped = run([mine[1], mine[0]]);
    const bad = (es: TripEval[]) => es.reduce((n, e) => n + e.violations.length, 0);
    const end = (es: TripEval[]) => es[es.length - 1].returnAt;
    if (bad(swapped) < bad(evals) || (bad(swapped) === bad(evals) && end(swapped) < end(evals))) evals = swapped;
  }
  const freshMinutes = evals.filter((e) => isFresh(e.trip)).reduce((s, e) => s + e.minutes, 0);
  const dayMinutes = evals.filter((e) => !isFresh(e.trip)).reduce((s, e) => s + e.minutes, 0);
  const fuelTodayL = evals.reduce((s, e) => s + e.fuelL, 0);
  const fuelWeekL = (ctx.fuelUsedL.get(vehicleId) ?? 0) + fuelTodayL;
  const violations: Violation[] = [];
  if (mine.length > MAX_TRIPS) violations.push({ code: "MAX_TRIPS", message: `${vehicleId} would run ${mine.length} trips; the limit is ${MAX_TRIPS}.` });
  if (freshMinutes > FRESH_BUDGET_MIN)
    violations.push({ code: "FRESH_BUDGET", message: `${vehicleId}'s Fresh trips need ${freshMinutes} min; the 03:30–08:00 budget is ${FRESH_BUDGET_MIN}.` });
  if (dayMinutes > DAY_BUDGET_MIN)
    violations.push({ code: "DAY_BUDGET", message: `${vehicleId}'s Style/Tech trips need ${dayMinutes} min; the budget is ${DAY_BUDGET_MIN}.` });
  if (fuelWeekL > vehicle.weeklyFuelQuotaL + 1e-9)
    violations.push({ code: "FUEL_QUOTA", message: `${vehicleId} would use ${Math.round(fuelWeekL)} L this week; quota is ${vehicle.weeklyFuelQuotaL} L.` });
  return { vehicle, trips: evals, freshMinutes, dayMinutes, fuelTodayL, fuelWeekL, violations };
}

/** All hard-rule violations for a vehicle's day (trip-level + vehicle-level). */
export function vehicleViolations(ev: VehicleDayEval): Violation[] {
  return [...ev.trips.flatMap((t) => t.violations), ...ev.violations];
}
