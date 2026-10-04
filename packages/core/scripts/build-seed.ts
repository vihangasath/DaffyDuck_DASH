/**
 * Builds packages/core/src/seed.json from the shared competition CSVs in /data.
 *
 *   node scripts/build-seed.ts            (Node >= 22.18 strips TS types natively)
 *
 * Demo day: Thu 18 Dec 2025, one week before Christmas (festival_ramp 0.3,
 * not payday, no monsoon), which matches Task 2B scenario S1's conditions.
 *  - Peliyagoda orders + fleet status come from the S1 peak-day scenario files.
 *  - Kandy orders come from deliveries_train.csv for the same date.
 *  - Service history, deferral log and weekly volumes come from deliveries_train.csv.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { daysBetween } from "../src/domain/time.ts";

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, "../../../data");
const OUT = join(here, "../src/seed.json");
const DEMO_DATE = "2025-12-18";
const HISTORY_DAYS = 14;
const WEEKS_BACK = 16;
const WEEKS_AHEAD = 10;

type Row = Record<string, string>;

function csv(path: string): Row[] {
  const [head, ...lines] = readFileSync(join(DATA, path), "utf8").trim().split(/\r?\n/);
  const cols = head.split(",");
  return lines.map((l) => {
    const v = l.split(",");
    return Object.fromEntries(cols.map((c, i) => [c, v[i] ?? ""]));
  });
}
const num = (s: string) => (s === "" ? 0 : Number(s));

const outlets = csv("General Data/outlets.csv").map((r) => ({
  id: r.outlet_id,
  brand: r.brand,
  district: r.district,
  depot: r.depot,
  dockType: r.dock_type,
  parking: r.parking_constraint,
  mallWindow: r.mall_window || null,
  windowOpen: r.window_open_time,
  windowClose: r.window_close_time,
}));
const outletById = new Map(outlets.map((o) => [o.id, o]));

const vehicles = csv("General Data/vehicles.csv").map((r) => ({
  id: r.vehicle_id,
  type: r.type,
  temp: r.temp,
  weightCapKg: num(r.weight_cap_kg),
  volumeCapM3: num(r.volume_cap_m3),
  fuelType: r.fuel_type,
  kmPerL: num(r.km_per_l),
  weeklyFuelQuotaL: num(r.weekly_fuel_quota_l),
  depot: r.depot,
}));

const districtTravel = csv("General Data/district_travel.csv").map((r) => ({
  district: r.district,
  depot: r.depot,
  roadClass: r.road_class,
  freeFlowKmh: num(r.free_flow_kmh),
  depotToDistrictKm: num(r.depot_to_district_km),
  depotToDistrictMin: num(r.depot_to_district_freeflow_min),
  interStopKm: num(r.inter_stop_km),
  interStopMin: num(r.inter_stop_freeflow_min),
}));

const serviceAllowance = csv("General Data/service_allowance.csv").map((r) => ({
  brand: r.brand,
  dockType: r.dock_type,
  minutes: num(r.service_allowance_min),
}));

const calendar = csv("General Data/calendar.csv").map((r) => ({
  date: r.date,
  dow: num(r.dow),
  isoYear: num(r.iso_year),
  isoWeek: num(r.iso_week),
  payday: r.is_payday === "1",
  festival: r.festival || null,
  festivalRamp: num(r.festival_ramp),
  holiday: r.is_holiday === "1",
  monsoon: r.monsoon === "1",
  operating: r.is_operating === "1",
}));
const calByDate = new Map(calendar.map((c) => [c.date, c]));

const road = csv("General Data/road_conditions.csv")
  .filter((r) => r.date === DEMO_DATE)
  .map((r) => ({ district: r.district, disruptionIndex: num(r.disruption_index) }));

// ---------- historical orders (training) ----------
const train = csv("Training Data/deliveries_train.csv");
const operatingDays = calendar
  .filter((c) => c.operating && c.date < DEMO_DATE)
  .map((c) => c.date)
  .slice(-HISTORY_DAYS);

// Per-outlet service status for the last N operating days: S served, D deferred/not run, N no order.
const statusByOutletDay = new Map<string, string>();
for (const r of train) {
  if (!operatingDays.includes(r.order_date)) continue;
  const k = `${r.outlet_id}|${r.order_date}`;
  const s = r.dispatch_status === "attempted" ? "S" : "D";
  // an outlet counts as deferred that day if any of its orders were deferred
  if (statusByOutletDay.get(k) !== "D") statusByOutletDay.set(k, s);
}
const serviceHistory = outlets.map((o) => ({
  outletId: o.id,
  days: operatingDays.map((d) => statusByOutletDay.get(`${o.id}|${d}`) ?? "N").join(""),
}));

// Last served date per outlet (for Kandy orders' days_since_last_served).
const lastServed = new Map<string, string>();
for (const r of train) {
  if (r.dispatch_status !== "attempted" || !r.dispatch_date || r.dispatch_date >= DEMO_DATE) continue;
  const prev = lastServed.get(r.outlet_id);
  if (!prev || r.dispatch_date > prev) lastServed.set(r.outlet_id, r.dispatch_date);
}

const deferralLog = train
  .filter((r) => r.dispatch_status !== "attempted" && operatingDays.includes(r.order_date))
  .map((r) => ({
    orderId: r.delivery_id,
    date: r.order_date,
    outletId: r.outlet_id,
    brand: r.brand,
    temp: r.temp_requirement,
    volumeM3: num(r.order_volume_m3),
    outcome: r.dispatch_status, // deferred | not_run
    reason: "Historical record (reason not captured in legacy process)",
    decidedBy: "Legacy spreadsheet",
    storeNotified: false,
  }))
  .sort((a, b) => b.date.localeCompare(a.date));

// Weekly volume by depot / brand / ISO week (orders counted once, by order week).
const weekKey = (y: number, w: number) => `${y}-W${String(w).padStart(2, "0")}`;
const weekly = new Map<string, { total: number; chilled: number }>();
for (const r of train) {
  const c = calByDate.get(r.order_date);
  if (!c) continue;
  const k = `${r.depot}|${r.brand}|${weekKey(c.isoYear, c.isoWeek)}`;
  const cur = weekly.get(k) ?? { total: 0, chilled: 0 };
  cur.total += num(r.order_volume_m3);
  if (r.temp_requirement === "chilled") cur.chilled += num(r.order_volume_m3);
  weekly.set(k, cur);
}
const demoCal = calByDate.get(DEMO_DATE)!;
const allWeeks = [...new Set(calendar.map((c) => weekKey(c.isoYear, c.isoWeek)))].sort();
const demoWeekIdx = allWeeks.indexOf(weekKey(demoCal.isoYear, demoCal.isoWeek));
const pastWeeks = allWeeks.slice(demoWeekIdx - WEEKS_BACK, demoWeekIdx);
const futureWeeks = allWeeks.slice(demoWeekIdx, demoWeekIdx + WEEKS_AHEAD);
const weekMeta = (wk: string) => {
  const days = calendar.filter((c) => weekKey(c.isoYear, c.isoWeek) === wk);
  return {
    week: wk,
    start: days[0]?.date,
    end: days[days.length - 1]?.date,
    festival: days.find((d) => d.festival)?.festival ?? null,
    maxRamp: Math.max(...days.map((d) => d.festivalRamp)),
    payday: days.some((d) => d.payday),
    operatingDays: days.filter((d) => d.operating).length,
  };
};
const series: {
  depot: string; brand: string; week: string; totalM3: number; chilledM3: number; kind: "actual" | "forecast";
}[] = [];
for (const depot of ["Peliyagoda", "Kandy"]) {
  for (const brand of ["Fresh", "Style", "Tech"]) {
    const hist = pastWeeks.map((wk) => weekly.get(`${depot}|${brand}|${wk}`) ?? { total: 0, chilled: 0 });
    hist.forEach((h, i) =>
      series.push({ depot, brand, week: pastWeeks[i], totalM3: round(h.total), chilledM3: round(h.chilled), kind: "actual" }),
    );
    // Baseline forecast (placeholder for the Datathon 2A model): mean of last 6 full weeks,
    // scaled by operating days and a festival uplift.
    const recent = hist.slice(-6);
    const base = recent.reduce((s, h) => s + h.total, 0) / recent.length;
    const baseChill = recent.reduce((s, h) => s + h.chilled, 0) / recent.length;
    for (const wk of futureWeeks) {
      const m = weekMeta(wk);
      const scale = (m.operatingDays / 6) * (1 + 0.18 * m.maxRamp);
      series.push({ depot, brand, week: wk, totalM3: round(base * scale), chilledM3: round(baseChill * scale), kind: "forecast" });
    }
  }
}
function round(n: number) {
  return Math.round(n * 10) / 10;
}

// ---------- demo-day orders ----------
const s1 = csv("Test Data/task2b_peak_day_scenarios.csv").map((r) => ({
  id: r.order_ref,
  outletId: r.outlet_id,
  depot: r.depot,
  brand: r.brand,
  temp: r.temp_requirement,
  units: num(r.order_units),
  weightKg: num(r.order_weight_kg),
  volumeM3: num(r.order_volume_m3),
  deferredYesterday: r.deferred_yesterday === "1",
  daysSinceLastServed: num(r.days_since_last_served),
  source: "S1 peak-day scenario",
}));

let kandySeq = 0;
const kandyPrevDay = operatingDays[operatingDays.length - 1];
const kandyDeferredYesterday = new Set(
  train
    .filter((r) => r.depot === "Kandy" && r.order_date === kandyPrevDay && r.dispatch_status !== "attempted")
    .map((r) => r.outlet_id),
);
const kandy = train
  .filter((r) => r.order_date === DEMO_DATE && r.depot === "Kandy")
  .map((r) => ({
    id: `K1-${String(kandySeq++).padStart(3, "0")}`,
    outletId: r.outlet_id,
    depot: r.depot,
    brand: r.brand,
    temp: r.temp_requirement,
    units: num(r.order_units),
    weightKg: num(r.order_weight_kg),
    volumeM3: num(r.order_volume_m3),
    deferredYesterday: kandyDeferredYesterday.has(r.outlet_id),
    daysSinceLastServed: lastServed.has(r.outlet_id) ? daysBetween(lastServed.get(r.outlet_id)!, DEMO_DATE) : 7,
    source: "deliveries_train " + r.delivery_id,
  }));

// Fuel already used this ISO week (Mon → day before demo) from route legs, plus the return leg.
const weekStart = calendar.find((c) => c.isoYear === demoCal.isoYear && c.isoWeek === demoCal.isoWeek)!.date;
const kmByVehicle = new Map<string, number>();
const routeDistrict = new Map<string, { vehicle: string; district: string; depot: string }>();
for (const r of csv("Training Data/route_legs_train.csv")) {
  if (r.date < weekStart || r.date >= DEMO_DATE) continue;
  kmByVehicle.set(r.vehicle_id, (kmByVehicle.get(r.vehicle_id) ?? 0) + num(r.distance_km));
  routeDistrict.set(r.route_id, { vehicle: r.vehicle_id, district: r.district, depot: r.depot });
}
for (const { vehicle, district } of routeDistrict.values()) {
  const back = districtTravel.find((d) => d.district === district)?.depotToDistrictKm ?? 0;
  kmByVehicle.set(vehicle, (kmByVehicle.get(vehicle) ?? 0) + back);
}
const fuelUsedThisWeek = vehicles.map((v) => ({
  vehicleId: v.id,
  km: round(kmByVehicle.get(v.id) ?? 0),
  litres: round((kmByVehicle.get(v.id) ?? 0) / v.kmPerL),
}));

const s1Fleet = new Map(csv("Test Data/task2b_peak_day_fleet.csv").map((r) => [r.vehicle_id, r.status]));
const fleetStatus = vehicles.map((v) => ({
  vehicleId: v.id,
  status: v.depot === "Peliyagoda" ? (s1Fleet.get(v.id) ?? "available") : "available",
}));

for (const o of [...s1, ...kandy]) {
  if (!outletById.has(o.outletId)) throw new Error("Unknown outlet " + o.outletId);
}

const seed = {
  meta: {
    generatedAt: new Date().toISOString(),
    demoDate: DEMO_DATE,
    note: "Derived from the Tech-Triathlon 2026 shared datasets. Competition use only.",
    historyDays: operatingDays,
    pastWeeks,
    futureWeeks: futureWeeks.map(weekMeta),
  },
  outlets,
  vehicles,
  districtTravel,
  serviceAllowance,
  calendar: calendar.filter((c) => c.date >= "2025-06-01" && c.date <= "2026-06-30"),
  roadConditions: road,
  orders: [...s1, ...kandy],
  fleetStatus,
  fuelUsedThisWeek,
  serviceHistory,
  deferralLog: deferralLog.slice(0, 60),
  weeklyVolume: series,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(seed));
console.log(
  `seed.json: ${outlets.length} outlets, ${vehicles.length} vehicles, ${s1.length} Peliyagoda + ${kandy.length} Kandy orders, ` +
    `${deferralLog.length} historical deferrals, ${series.length} weekly points`,
);
