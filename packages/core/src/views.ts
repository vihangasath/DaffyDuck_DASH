// Derived, role-specific views over the operational state: pure functions, used by the screens
// and by the API (the live watch, visibility rules).
import type { Db } from "./contract";
import { contextFor, net, outletName, seed } from "./reference";
import type { Depot, Order, Plan } from "./domain/types";
import { evaluateVehicle, type TripEval } from "./planner/evaluate";

export type OrderStatus =
  | "confirmed" | "planned" | "deferred" | "loading" | "on_the_way" | "arrived" | "delivered" | "failed" | "received" | "next_run";

export interface OrderState {
  order: Order;
  status: OrderStatus;
  plan: Plan | null;
  tripEval?: TripEval;
  stopIndex?: number;
  eta?: number; // minutes after midnight
  deferral?: Plan["deferred"][number];
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  confirmed: "Confirmed",
  planned: "Planned",
  deferred: "Moved to next run",
  loading: "Loading",
  on_the_way: "On the way",
  arrived: "Driver arrived",
  delivered: "Delivered",
  failed: "Not delivered",
  received: "Received",
  next_run: "Next run",
};

export const depotOfVehicle = (vehicleId: string): Depot => seed.vehicles.find((v) => v.id === vehicleId)!.depot;

/** Evaluated trips (with ETAs) for one vehicle in the published plan. */
export function vehicleTrips(db: Db, vehicleId: string): TripEval[] {
  const plan = db.plans[depotOfVehicle(vehicleId)];
  if (!plan || plan.status !== "published") return [];
  return evaluateVehicle(vehicleId, plan.trips, contextFor(db.orders, db.fleetStatus)).trips;
}

export function orderState(db: Db, orderId: string): OrderState {
  const order = db.orders.find((o) => o.id === orderId)!;
  if (order.forDate === "next-run") return { order, status: "next_run", plan: null };
  const plan = db.plans[order.depot];
  if (!plan || plan.status !== "published") return { order, status: "confirmed", plan };
  const trip = plan.trips.find((t) => t.orderIds.includes(orderId));
  const te = trip ? vehicleTrips(db, trip.vehicleId).find((t) => t.trip.id === trip.id) : undefined;
  const idx = te?.stops.findIndex((s) => s.orderId === orderId) ?? -1;
  const base = { order, plan, tripEval: te, stopIndex: idx, eta: idx >= 0 ? te?.stops[idx]?.arrive : undefined };
  const stop = db.stops[orderId];
  // A late offline driver record is a delivery fact and takes precedence over a deferral
  // made while dispatch could not see the phone.
  if (db.receipts[orderId]) return { ...base, status: "received" };
  if (stop?.deliveredAt) return { ...base, status: "delivered" };
  if (stop?.problem) return { ...base, status: "failed" };
  if (stop?.arrivedAt) return { ...base, status: "arrived" };
  const deferral = plan.deferred.find((d) => d.orderId === orderId);
  if (deferral) return { ...base, status: "deferred", deferral };
  if (!trip) return { ...base, status: "planned" };
  const load = db.loads[trip.id];
  if (load?.status === "released") return { ...base, status: "on_the_way" };
  if (load && load.status !== "not_started") return { ...base, status: "loading" };
  return { ...base, status: "planned" };
}

/** Deterministic "demo clock": events are stamped near the planned time so the story stays coherent. */
export function demoStamp(plannedMin: number, orderId: string, extra = 0): string {
  const jitter = [...orderId].reduce((s, c) => s + c.charCodeAt(0), 0) % 7;
  const m = Math.round(plannedMin + jitter + extra);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export const mapsUrl = (outletId: string) => {
  const o = net.outlets.get(outletId)!;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${outletName(outletId)}, ${o.district}, Sri Lanka`)}`;
};
