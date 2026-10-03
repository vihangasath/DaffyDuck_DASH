// Live progress of a vehicle's day against its plan. Times are on the demo clock (minutes after
// midnight on the plan date), like every planner ETA. The real clock enters through the latest driver
// record: from the moment it was made on the phone, the vehicle's demo clock runs at real speed.
//
// Projection, stop by stop in delivery order:
//   done / failed  the recorded times
//   here           arrived, not finished: leaves after its expected handling time, or now if that has passed
//   ahead          previous leave + the planned leg, then waits for the window and handles as planned
// A later trip leaves at its planned time or when the previous trip is projected back, whichever is later.
// In transit nothing is extrapolated from silence (the phone may just be in a dead zone): only records move
// the projection, and a dwell at a stop the driver is known to be at.
import type { Db } from "./contract";
import type { TripEval } from "./planner/evaluate";
import { net } from "./reference";
import { parseWindow, toMin } from "./domain/time";

/** Extra minutes at a stop, beyond its expected handling time, before dispatch is alerted. */
export const DWELL_BUFFER_MIN = 10;
/** A store is told when its stop is projected at least this many minutes past its window. */
export const LATE_NOTICE_MIN = 5;
/** A further notice goes out when the projection slips this much beyond the last one. */
export const LATE_RENOTICE_MIN = 15;

export type LiveState = "done" | "failed" | "here" | "ahead";

export interface LiveStop {
  orderId: string;
  outletId: string;
  tripId: string;
  seq: number;
  state: LiveState;
  plannedArrive: number;
  /** Actual arrival when recorded, else the projection. */
  arrive: number;
  leave: number;
  /** Window close (the mall bay's when it has one). */
  close: number;
  /** Projected arrival minus the window close: above 0 means late. */
  lateMin: number;
  /** Expected handling minutes at the stop (Task 1 pred_service_min or the allowance). */
  serviceMin: number;
  /** Minutes until the projected arrival, once the vehicle has left the depot. */
  minutesAway?: number;
  /** Minutes since the driver recorded arriving here (state "here"). */
  dwellMin?: number;
}

export interface LiveTrip {
  te: TripEval;
  released: boolean;
  /** Projected departure (planned, or later when the previous trip runs late). */
  depart: number;
  returnAt: number;
  stops: LiveStop[];
}

export interface LiveRun {
  vehicleId: string;
  trips: LiveTrip[];
  /** The vehicle's demo clock now; undefined until it has left the depot. */
  nowDemo?: number;
}

const windowOf = (outletId: string): [number, number] => {
  const o = net.outlets.get(outletId)!;
  return o.mallWindow ? parseWindow(o.mallWindow) : [toMin(o.windowOpen), toMin(o.windowClose)];
};

const done = (r?: Db["stops"][string]) => !!(r?.deliveredAt || r?.problem);

/** The latest real-world record for the vehicle, mapped to the demo clock. */
function anchorOf(trips: TripEval[], db: Pick<Db, "stops" | "loads">): { demo: number; real: number } | undefined {
  let best: { demo: number; real: number } | undefined;
  const offer = (demo: number, iso?: string) => {
    const real = iso ? Date.parse(iso) : NaN;
    if (Number.isFinite(real) && (!best || real > best.real)) best = { demo, real };
  };
  for (const te of trips) {
    const load = db.loads[te.trip.id];
    if (load?.status === "released") offer(te.depart, load.releasedAt);
    for (const s of te.stops) {
      const r = db.stops[s.orderId];
      if (!r) continue;
      if (r.deliveredAt) offer(toMin(r.deliveredAt), r.recordedAt);
      else if (r.problem) offer(r.arrivedAt ? toMin(r.arrivedAt) : s.arrive, r.recordedAt);
      else if (r.arrivedAt) offer(toMin(r.arrivedAt), r.recordedAt);
    }
  }
  return best;
}

/** Projects every stop of a vehicle's day (its trips as evaluated by the planner, in order). */
export function liveRun(vehicleId: string, trips: TripEval[], db: Pick<Db, "stops" | "loads">, nowMs: number): LiveRun {
  const ordered = [...trips].sort((a, b) => a.depart - b.depart);
  const anchor = anchorOf(ordered, db);
  const nowDemo = anchor ? anchor.demo + (nowMs - anchor.real) / 60_000 : undefined;
  let freeAt = -Infinity;
  const out: LiveTrip[] = [];
  for (const te of ordered) {
    const released = db.loads[te.trip.id]?.status === "released";
    const depart = Math.max(te.depart, freeAt);
    let t = depart;
    let prevPlannedLeave = te.depart;
    const stops: LiveStop[] = te.stops.map((s) => {
      const r = db.stops[s.orderId];
      const serviceMin = s.leave - s.start;
      const leg = s.arrive - prevPlannedLeave;
      prevPlannedLeave = s.leave;
      const [open, close] = windowOf(s.outletId);
      let state: LiveState;
      let arrive: number;
      let leave: number;
      let dwellMin: number | undefined;
      if (done(r)) {
        state = r!.deliveredAt ? "done" : "failed";
        arrive = r!.arrivedAt ? toMin(r!.arrivedAt) : r!.deliveredAt ? toMin(r!.deliveredAt) - serviceMin : t + leg;
        leave = r!.deliveredAt ? toMin(r!.deliveredAt) : arrive;
      } else if (r?.arrivedAt) {
        state = "here";
        arrive = toMin(r.arrivedAt);
        dwellMin = Math.max(0, (nowMs - Date.parse(r.recordedAt)) / 60_000);
        leave = Math.max(Math.max(arrive, open) + serviceMin, arrive + dwellMin);
      } else {
        state = "ahead";
        arrive = t + leg;
        leave = Math.max(arrive, open) + serviceMin;
      }
      t = leave;
      return {
        orderId: s.orderId, outletId: s.outletId, tripId: te.trip.id, seq: s.seq, state, plannedArrive: s.arrive, arrive, leave, close,
        lateMin: arrive - close, serviceMin, dwellMin,
        minutesAway: state === "ahead" && released && nowDemo != null ? arrive - nowDemo : undefined,
      };
    });
    const returnAt = t + (te.returnAt - te.finish);
    freeAt = returnAt;
    out.push({ te, released, depart, returnAt, stops });
  }
  return { vehicleId, trips: out, nowDemo };
}

/** A stop the driver has been at for longer than its handling time plus the buffer. */
export const overstaying = (s: LiveStop) => s.state === "here" && s.dwellMin != null && s.dwellMin > s.serviceMin + DWELL_BUFFER_MIN;
