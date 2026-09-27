import { describe, expect, it } from "vitest";
import seedJson from "../seed.json";
import { buildContext, buildNetwork, type SeedData } from "../domain/network";
import { autoPlan, moveOrder, planMetrics, suggestFor, validatePlan } from "./allocate";
import { FRESH_BUDGET_MIN, DAY_BUDGET_MIN, tripMinutes } from "./evaluate";

const seed = seedJson as unknown as SeedData;
const net = buildNetwork(seed);
const ctx = buildContext(net, seed.orders, seed.fleetStatus, seed.fuelUsedThisWeek);
const ramp = seed.calendar.find((c) => c.date === seed.meta.demoDate)!.festivalRamp;

for (const depot of ["Peliyagoda", "Kandy"] as const) {
  describe(`auto-plan · ${depot}`, () => {
    const orders = seed.orders.filter((o) => o.depot === depot);
    const plan = autoPlan({ date: seed.meta.demoDate, depot, orders, ctx, festivalRamp: ramp });

    it("marks every order exactly once as served or deferred", () => {
      const ids = [...plan.trips.flatMap((t) => t.orderIds), ...plan.deferred.map((d) => d.orderId)].sort();
      expect(ids).toEqual(orders.map((o) => o.id).sort());
    });

    it("passes the independent Task 2B feasibility re-check", () => {
      expect(validatePlan(plan, orders, ctx)).toEqual([]);
    });

    it("respects every rule trip by trip (mirrors check_allocation)", () => {
      for (const t of plan.trips) {
        const v = net.vehicles.get(t.vehicleId)!;
        const os = t.orderIds.map((id) => ctx.orders.get(id)!);
        expect(ctx.available.has(v.id)).toBe(true);
        expect(v.depot).toBe(depot);
        for (const o of os) {
          const out = net.outlets.get(o.outletId)!;
          expect(o.brand).toBe(t.brand);
          expect(out.district).toBe(t.district);
          if (o.temp === "chilled") expect(v.temp).toBe("reefer");
          if (out.parking === "van_only") expect(v.type).toBe("van");
        }
        expect(os.reduce((s, o) => s + o.volumeM3, 0)).toBeLessThanOrEqual(v.volumeCapM3 + 1e-9);
        expect(os.reduce((s, o) => s + o.weightKg, 0)).toBeLessThanOrEqual(v.weightCapKg + 1e-9);
      }
      for (const vid of new Set(plan.trips.map((t) => t.vehicleId))) {
        const mine = plan.trips.filter((t) => t.vehicleId === vid);
        expect(mine.length).toBeLessThanOrEqual(2);
        const fresh = mine.filter((t) => t.brand === "Fresh").reduce((s, t) => s + tripMinutes(t, ctx), 0);
        const day = mine.filter((t) => t.brand !== "Fresh").reduce((s, t) => s + tripMinutes(t, ctx), 0);
        expect(fresh).toBeLessThanOrEqual(FRESH_BUDGET_MIN);
        expect(day).toBeLessThanOrEqual(DAY_BUDGET_MIN);
      }
    });

    it("gives every deferral a reason", () => {
      for (const d of plan.deferred) expect(d.reason.length).toBeGreaterThan(10);
    });

    it("reports metrics", () => {
      const m = planMetrics(plan, orders, ctx);
      console.log(depot, JSON.stringify({ served: m.served, deferred: m.deferred, reefer: m.reeferPressure.toFixed(2), binding: m.bindingConstraint, codes: plan.deferred.map((d) => d.code) }));
      expect(m.served + m.deferred).toBe(orders.length);
    });
  });
}

describe("manual moves", () => {
  const depot = "Peliyagoda" as const;
  const orders = seed.orders.filter((o) => o.depot === depot);
  const plan = autoPlan({ date: seed.meta.demoDate, depot, orders, ctx, festivalRamp: ramp });

  it("peak day defers chilled orders because reefer capacity binds", () => {
    const m = planMetrics(plan, orders, ctx);
    expect(m.deferred).toBeGreaterThan(0);
    expect(m.reeferPressure).toBeGreaterThan(1);
  });

  it("rejects a chilled order dropped onto an ambient truck, with the rule", () => {
    const chilledServed = plan.trips.flatMap((t) => t.orderIds).find((id) => ctx.orders.get(id)!.temp === "chilled")!;
    const ambientTrip = plan.trips.find((t) => net.vehicles.get(t.vehicleId)!.temp === "ambient")!;
    const r = moveOrder(plan, chilledServed, { tripId: ambientTrip.id }, ctx);
    expect(r.ok).toBe(false);
    expect(r.violations.map((v) => v.code)).toContain("REEFER");
    expect(r.plan).toBe(plan);
  });

  it("can defer a served order manually and re-serve it", () => {
    const trip = plan.trips.find((t) => t.orderIds.length > 1)!;
    const id = trip.orderIds[0];
    const d = moveOrder(plan, id, { defer: true, by: "Nimali" }, ctx);
    expect(d.ok).toBe(true);
    expect(d.plan.deferred.find((x) => x.orderId === id)?.decidedBy).toBe("Nimali");
    const back = moveOrder(d.plan, id, { tripId: trip.id }, ctx);
    expect(back.ok).toBe(true);
    expect(validatePlan(back.plan, orders, ctx)).toEqual([]);
  });

  it("only suggests moves that are actually feasible", () => {
    for (const d of plan.deferred) {
      const s = suggestFor(plan, d.orderId, ctx, ramp);
      if (!s) continue;
      let p = plan;
      if (s.kind === "swap") p = moveOrder(p, s.removeOrderId!, { defer: true, by: "test" }, ctx).plan;
      const r = moveOrder(p, d.orderId, s.kind === "newTrip" ? { newTripOn: s.vehicleId } : { tripId: s.tripId }, ctx);
      expect(r.ok).toBe(true);
      expect(validatePlan(r.plan, orders, ctx)).toEqual([]);
    }
  });

  it("does not skip an outlet two runs in a row when a vehicle can reach it", () => {
    const again = plan.deferred.filter((d) => ctx.orders.get(d.orderId)!.deferredYesterday && d.code !== "OVERSIZE");
    for (const d of again) expect(suggestFor(plan, d.orderId, ctx, ramp)?.kind).not.toBe("newTrip");
  });
});
