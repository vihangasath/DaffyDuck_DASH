import { describe, expect, it } from "vitest";
import seedJson from "./seed.json";
import { buildContext, buildNetwork, type SeedData } from "./domain/network";
import { autoPlan } from "./planner/allocate";
import { evaluateVehicle, tripMinutes } from "./planner/evaluate";
import { BASELINE_PREDICTIONS, baselineLateRisk, type Predictions } from "./predictions";

const seed = seedJson as unknown as SeedData;
const ramp = seed.calendar.find((c) => c.date === seed.meta.demoDate)!.festivalRamp;
const orders = seed.orders.filter((o) => o.depot === "Kandy");

function evaluate(predictions?: Predictions) {
  const net = buildNetwork({ ...seed, predictions });
  const ctx = buildContext(net, seed.orders, seed.fleetStatus, seed.fuelUsedThisWeek);
  const plan = autoPlan({ date: seed.meta.demoDate, depot: "Kandy", orders, ctx, festivalRamp: ramp });
  const trip = plan.trips.find((t) => t.orderIds.length >= 2)!;
  return { net, ctx, trip, te: evaluateVehicle(trip.vehicleId, plan.trips, ctx).trips.find((t) => t.trip.id === trip.id)! };
}

describe("Datathon predictions", () => {
  const base = evaluate();

  it("uses the service allowance and the ETA baseline when no model is connected", () => {
    expect(evaluate(BASELINE_PREDICTIONS).te.stops).toEqual(base.te.stops);
    for (const s of base.te.stops) {
      const o = base.net.outlets.get(s.outletId)!;
      expect(s.leave - s.start).toBe(base.net.allowance(base.trip.brand, o.dockType));
      expect(s.lateRisk).toBe(baselineLateRisk(s.arrive, o));
    }
  });

  it("feeds Task 1 predictions into ETAs and late risk, but not the brief's trip budgets", () => {
    const [first, second] = base.te.stops;
    const model = evaluate({
      task1: { source: "model", byOrder: { [first.orderId]: { serviceMin: 60, lateProb: 0.8 } } },
      task2a: { source: "baseline" },
    });
    const [m1, m2] = model.te.stops;
    expect(m1.leave - m1.start).toBe(60);
    expect(m1.lateRisk).toBe(0.8);
    // The next stop arrives later by the extra handling time.
    const extra = 60 - (first.leave - first.start);
    expect(m2.arrive).toBe(second.arrive + extra);
    // Stops the model didn't score keep the baseline.
    expect(m2.lateRisk).toBe(baselineLateRisk(m2.arrive, model.net.outlets.get(m2.outletId)!));
    expect(tripMinutes(model.trip, model.ctx)).toBe(tripMinutes(base.trip, base.ctx));
  });
});
