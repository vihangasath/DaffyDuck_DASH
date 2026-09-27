import type { Db, LoadCheck } from "./contract";
import { contextFor } from "./reference";
import type { Depot } from "./domain/types";
import { evaluateVehicle, type TripEval } from "./planner/evaluate";

export interface DockTrip {
  te: TripEval;
  load: LoadCheck;
  bay: number;
  planned: number;
  loaded: number;
  shortfalls: number;
  changed: boolean;
}

/** Trips of the published plan in departure order, with their load progress. */
export function dockTrips(db: Db, depot: Depot, seenVersion: number): DockTrip[] {
  const plan = db.plans[depot];
  if (!plan || plan.status !== "published") return [];
  const ctx = contextFor(db.orders, db.fleetStatus);
  const vids = [...new Set(plan.trips.map((t) => t.vehicleId))];
  const all = vids.flatMap((v) => evaluateVehicle(v, plan.trips, ctx).trips).sort((a, b) => a.depart - b.depart || a.vehicle.id.localeCompare(b.vehicle.id));
  return all
    .filter((te) => db.loads[te.trip.id])
    .map((te, i) => {
      const load = db.loads[te.trip.id];
      const lines = Object.values(load.lines);
      return {
        te,
        load,
        bay: (i % 12) + 1,
        planned: lines.reduce((s, l) => s + l.planned, 0),
        loaded: lines.reduce((s, l) => s + l.loaded, 0),
        shortfalls: db.shortfalls.filter((s) => s.tripId === te.trip.id).length,
        changed: (load.changedVersion ?? 0) > seenVersion,
      };
    });
}

export const LOAD_LABEL: Record<LoadCheck["status"], string> = {
  not_started: "Not started",
  loading: "Loading",
  held: "Held · shortfall",
  released: "Released",
};
