import { describe, expect, it } from "vitest";
import { daysBetween, fmtMin, parseWindow, toMin } from "./time";
import { outletLatLng } from "./geo";
import { seed } from "../reference";
import { demoStamp } from "../views";

describe("time", () => {
  it("converts between clock times and minutes after midnight", () => {
    expect(toMin("05:30")).toBe(330);
    expect(fmtMin(330)).toBe("05:30");
    expect(fmtMin(toMin("23:59"))).toBe("23:59");
  });

  it("rounds to the minute and wraps past midnight", () => {
    expect(fmtMin(329.6)).toBe("05:30");
    expect(fmtMin(24 * 60 + 15)).toBe("00:15");
  });

  it("reads a delivery window", () => {
    expect(parseWindow("09:00-11:00")).toEqual([540, 660]);
  });

  it("counts whole days between ISO dates, negative when the second is earlier", () => {
    expect(daysBetween("2026-10-04", "2026-10-20")).toBe(16);
    expect(daysBetween("2026-10-20", "2026-10-04")).toBe(-16);
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
  });
});

describe("outlet positions", () => {
  const outlet = { ...seed.outlets[0], lat: null, lng: null };

  it("uses stored coordinates when the outlet has them", () => {
    expect(outletLatLng({ ...outlet, lat: 7.1, lng: 80.2 }, "Borella")).toEqual([7.1, 80.2]);
  });

  it("places a named neighbourhood at its centre", () => {
    expect(outletLatLng(outlet, "Borella")).toEqual([6.9147, 79.8778]);
  });

  it("offsets a numbered branch a few hundred metres from its neighbourhood, the same way every time", () => {
    const [lat, lng] = outletLatLng(outlet, "Borella 2");
    const offset = Math.hypot(lat - 6.9147, lng - 79.8778);
    expect(offset).toBeGreaterThan(0.001);
    expect(offset).toBeLessThan(0.007);
    expect(outletLatLng(outlet, "Borella 2")).toEqual([lat, lng]);
  });

  it("keeps two branches in the same place from stacking", () => {
    const [a, b] = seed.outlets;
    expect(outletLatLng({ ...a, lat: null, lng: null }, "Nowhere")).not.toEqual(outletLatLng({ ...b, district: a.district, depot: a.depot, lat: null, lng: null }, "Nowhere"));
  });
});

describe("demo clock", () => {
  it("stamps an event a few minutes after its planned time, the same way every time", () => {
    const stamp = demoStamp(toMin("06:00"), "S1-013");
    expect(stamp).toMatch(/^\d{2}:\d{2}$/);
    expect(toMin(stamp) - toMin("06:00")).toBeGreaterThanOrEqual(0);
    expect(toMin(stamp) - toMin("06:00")).toBeLessThan(7);
    expect(demoStamp(toMin("06:00"), "S1-013")).toBe(stamp);
  });
});
