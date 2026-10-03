import { describe, expect, it } from "vitest";
import type { Db } from "./contract";
import type { TripEval } from "./planner/evaluate";
import { DWELL_BUFFER_MIN, liveRun, overstaying } from "./live";
import { seed } from "./reference";
import { toMin } from "./domain/time";

// Two stops on one trip, 20 min handling each, 15 min legs; windows wide open unless a test says otherwise.
const [a, b] = seed.outlets.filter((o) => !o.mallWindow).slice(0, 2);
const trip = (depart: number): TripEval =>
  ({
    trip: { id: "T1", vehicleId: "V", tripNo: 1, brand: a.brand, district: a.district, orderIds: ["A", "B"] },
    depart,
    finish: depart + 15 + 20 + 15 + 20,
    returnAt: depart + 15 + 20 + 15 + 20 + 15,
    stops: [
      { orderId: "A", outletId: a.id, seq: 0, arrive: depart + 15, start: depart + 15, leave: depart + 35, late: false, lateRisk: 0 },
      { orderId: "B", outletId: b.id, seq: 1, arrive: depart + 50, start: depart + 50, leave: depart + 70, late: false, lateRisk: 0 },
    ],
  }) as unknown as TripEval;
const open = Math.max(toMin(a.windowOpen), toMin(b.windowOpen));
const T0 = Date.parse("2026-10-03T00:00:00Z");
const min = (m: number) => T0 + m * 60_000;
const iso = (m: number) => new Date(min(m)).toISOString();
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const state = (stops: Db["stops"], released = true): Pick<Db, "stops" | "loads"> => ({
  stops,
  loads: { T1: { tripId: "T1", vehicleId: "V", planVersion: 1, lines: {}, status: released ? "released" : "loading", releasedAt: released ? iso(0) : undefined } },
});

describe("live run projection", () => {
  const dep = open; // leaves as the windows open
  it("counts down from the dock release while nothing else has happened", () => {
    const r = liveRun("V", [trip(dep)], state({}), min(5));
    expect(r.nowDemo).toBe(dep + 5);
    expect(r.trips[0].stops.map((s) => s.minutesAway)).toEqual([10, 45]);
  });
  it("has no countdown before the vehicle leaves", () => {
    const r = liveRun("V", [trip(dep)], state({}, false), min(5));
    expect(r.nowDemo).toBeUndefined();
    expect(r.trips[0].stops[0].minutesAway).toBeUndefined();
  });
  it("pushes later stops back while the driver stays past the handling time", () => {
    const arrived = { A: { orderId: "A", vehicleId: "V", arrivedAt: hhmm(dep + 15), recordedAt: iso(15), syncedAt: iso(15) } };
    const onTime = liveRun("V", [trip(dep)], state(arrived), min(30)).trips[0].stops;
    expect(onTime[0]).toMatchObject({ state: "here", dwellMin: 15 });
    expect(onTime[1].arrive).toBe(dep + 50);
    const long = liveRun("V", [trip(dep)], state(arrived), min(15 + 20 + DWELL_BUFFER_MIN + 5)).trips[0].stops;
    expect(overstaying(long[0])).toBe(true);
    expect(long[1].arrive).toBe(dep + 50 + DWELL_BUFFER_MIN + 5);
  });
  it("re-anchors on a recorded delivery", () => {
    const done = { A: { orderId: "A", vehicleId: "V", arrivedAt: hhmm(dep + 25), deliveredAt: hhmm(dep + 45), recordedAt: iso(45), syncedAt: iso(45) } };
    const s = liveRun("V", [trip(dep)], state(done), min(50)).trips[0].stops;
    expect(s[0].state).toBe("done");
    expect(s[1]).toMatchObject({ state: "ahead", arrive: dep + 60, minutesAway: 10 });
  });
});
