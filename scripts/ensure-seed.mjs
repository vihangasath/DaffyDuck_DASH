/**
 * Prepare the private competition seed when available. A clean public checkout gets a
 * clearly labelled, independently generated demo fixture so the stack can still boot.
 * The fixture is based only on the counts and operating rules printed in the booklet.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const target = resolve(root, "packages/core/src/seed.json");
const shared = resolve(root, "data/General Data/outlets.csv");
if (existsSync(target)) {
  console.log("Using the locally supplied private competition seed.");
  process.exit(0);
}
if (existsSync(shared)) {
  try {
    execFileSync(process.execPath, [resolve(root, "packages/core/scripts/build-seed.ts")], { cwd: root, stdio: "inherit" });
    process.exit(0);
  } catch (err) {
    console.warn("Could not rebuild seed from shared data; using existing seed or fixture.");
  }
}

const demoDate = "2025-12-18";
const pad = (n, width = 2) => String(n).padStart(width, "0");
const date = (d) => d.toISOString().slice(0, 10);
const plusDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000);
const week = (d) => {
  const x = new Date(Date.parse(d + "T00:00:00Z"));
  x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7));
  const first = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return `${x.getUTCFullYear()}-W${pad(Math.ceil((((x - first) / 86400000) + 1) / 7))}`;
};
const districts = [
  ["Colombo", "Peliyagoda", 12, 24, 5],
  ["Gampaha", "Peliyagoda", 28, 42, 7],
  ["Kalutara", "Peliyagoda", 48, 66, 9],
  ["Galle", "Peliyagoda", 115, 120, 8],
  ["Matara", "Peliyagoda", 150, 150, 10],
  ["Kurunegala", "Peliyagoda", 95, 100, 8],
  ["Puttalam", "Peliyagoda", 125, 135, 10],
  ["Kandy", "Kandy", 13, 25, 5],
  ["Matale", "Kandy", 34, 48, 7],
  ["Nuwara Eliya", "Kandy", 72, 105, 9],
  ["Badulla", "Kandy", 110, 145, 11],
  ["Kegalle", "Kandy", 55, 80, 8],
];
const byDepot = {
  Peliyagoda: districts.filter((x) => x[1] === "Peliyagoda"),
  Kandy: districts.filter((x) => x[1] === "Kandy"),
};
const districtTravel = districts.map(([district, depot, km, minutes, between]) => ({
  district, depot, roadClass: depot === "Kandy" ? "hill" : "suburban",
  freeFlowKmh: Math.round(km / (minutes / 60)),
  depotToDistrictKm: km, depotToDistrictMin: minutes,
  interStopKm: Math.max(2, Math.round(between / 2)),
  interStopMin: between,
}));
const outlets = Array.from({ length: 120 }, (_, i) => {
  const n = i + 1;
  const brand = n <= 80 ? "Fresh" : n <= 105 ? "Style" : "Tech";
  const depot = n <= 60 || (n >= 81 && n <= 95) || (n >= 106 && n <= 115) ? "Peliyagoda" : "Kandy";
  const group = byDepot[depot];
  const district = group[i % group.length][0];
  const mall = brand === "Style" && n % 2 === 0;
  return {
    id: `OUT${pad(n, 3)}`, brand, district, depot,
    dockType: mall ? "mall_bay" : n % 5 === 0 ? "street" : "rear_dock",
    parking: mall ? "mall_dock" : n % 17 === 0 ? "van_only" : "normal",
    mallWindow: mall ? "10:00-14:00" : null,
    windowOpen: brand === "Fresh" ? "03:30" : mall ? "10:00" : brand === "Style" ? "08:00" : "09:00",
    windowClose: brand === "Fresh" ? "07:45" : mall ? "14:00" : brand === "Style" ? "16:00" : "17:00",
  };
});
const vans = new Set([8, 20, 32, 44, 53, 54, 55, 56]);
const reeferVans = new Set([8, 20, 53, 54]);
const reeferTrucks = new Set([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13]);
const vehicles = Array.from({ length: 60 }, (_, i) => {
  const n = i + 1;
  const van = vans.has(n);
  const reefer = van ? reeferVans.has(n) : reeferTrucks.has(n);
  return {
    id: `VEH${pad(n, 3)}`, type: van ? "van" : "truck", temp: reefer ? "reefer" : "ambient",
    weightCapKg: van ? 900 : 3500, volumeCapM3: van ? 8 : reefer ? 18 : 24,
    fuelType: "diesel", kmPerL: van ? 9 : 6,
    weeklyFuelQuotaL: 170, depot: n <= 38 ? "Peliyagoda" : "Kandy",
  };
});
const serviceAllowance = ["Fresh", "Style", "Tech"].flatMap((brand) =>
  [["rear_dock", 13], ["street", 19], ["mall_bay", 25]].map(([dockType, minutes]) => ({ brand, dockType, minutes })));
const calendar = [];
for (let d = "2025-09-01"; d <= "2026-06-30"; d = date(plusDays(d, 1))) {
  const dow = (plusDays(d, 0).getUTCDay() + 6) % 7;
  calendar.push({
    date: d, dow, isoYear: Number(week(d).slice(0, 4)), isoWeek: Number(week(d).slice(6)),
    payday: d.slice(-2) === "25", festival: d === "2025-12-25" ? "Christmas" : null,
    festivalRamp: d >= "2025-12-16" && d <= "2025-12-25" ? 0.3 : 0,
    holiday: d === "2025-12-25", monsoon: [5, 6, 10, 11].includes(Number(d.slice(5, 7))),
    operating: dow !== 6 && d !== "2025-12-25",
  });
}
const historyDays = calendar.filter((c) => c.date < demoDate && c.operating).slice(-14).map((c) => c.date);
const monday = date(plusDays(demoDate, -((plusDays(demoDate, 0).getUTCDay() + 6) % 7)));
const pastWeeks = Array.from({ length: 16 }, (_, i) => week(date(plusDays(monday, (i - 16) * 7))));
const futureWeeks = Array.from({ length: 10 }, (_, i) => {
  const start = date(plusDays(monday, (i + 1) * 7));
  return { week: week(start), start, end: date(plusDays(start, 6)), festival: i === 0 ? "Christmas" : null, maxRamp: i === 0 ? 1 : 0, payday: i % 4 === 0, operatingDays: 6 };
});
let orderNo = 0;
const orders = outlets.flatMap((o, i) => {
  const types = o.brand === "Fresh" && i % 2 === 0 ? ["ambient", "chilled"] : [o.brand === "Fresh" && i % 3 === 0 ? "chilled" : "ambient"];
  return types.map((temp) => {
    orderNo += 1;
    const volumeM3 = o.brand === "Style" ? 5 + (i % 4) : o.brand === "Tech" ? 2 + (i % 3) : temp === "chilled" ? 9.5 + (i % 4) * 0.7 : 5 + (i % 4) * 0.5;
    return {
      id: `DEMO-${pad(orderNo, 3)}`, outletId: o.id, depot: o.depot, brand: o.brand, temp,
      units: 20 + i % 35, weightKg: Math.round(volumeM3 * (o.brand === "Tech" ? 220 : 100)), volumeM3,
      deferredYesterday: i % 19 === 0, daysSinceLastServed: 1 + i % 7, source: "Independent synthetic demo",
    };
  });
});
const workshop = new Set([2, 4, 7, 14, 18, 23, 27, 34, 36, 38]);
const fleetStatus = vehicles.map((v, i) => ({ vehicleId: v.id, status: workshop.has(i + 1) ? "in_workshop" : "available" }));
const fuelUsedThisWeek = vehicles.map((v) => ({ vehicleId: v.id, km: 90, litres: 15 }));
const serviceHistory = outlets.map((o, i) => ({ outletId: o.id, days: Array.from({ length: 14 }, (_, j) => (i + j) % 19 === 0 ? "D" : (i + j) % 4 === 0 ? "N" : "S").join("") }));
const deferralLog = orders.filter((_, i) => i % 17 === 0).map((o, i) => ({
  orderId: `HIST-${pad(i, 3)}`, date: historyDays[i % historyDays.length], outletId: o.outletId,
  brand: o.brand, temp: o.temp, volumeM3: o.volumeM3, outcome: "deferred",
  reason: "No suitable vehicle on the previous run.", decidedBy: "Synthetic demo", storeNotified: true,
}));
const weeklyVolume = ["Peliyagoda", "Kandy"].flatMap((depot) => ["Fresh", "Style", "Tech"].flatMap((brand) =>
  [...pastWeeks.map((wk, i) => ({ week: wk, kind: "actual", i })), ...futureWeeks.map((wk, i) => ({ week: wk.week, kind: "forecast", i: i + 16 }))].map(({ week: wk, kind, i }) => {
    const totalM3 = Math.round((brand === "Fresh" ? 190 : brand === "Style" ? 70 : 45) * (depot === "Kandy" ? 0.55 : 1) * (1 + (i % 5) * 0.04) * 10) / 10;
    return { depot, brand, week: wk, totalM3, chilledM3: brand === "Fresh" ? Math.round(totalM3 * 0.36 * 10) / 10 : 0, kind };
  })));
const fixture = {
  meta: { demoDate, historyDays, pastWeeks, futureWeeks, note: "Independent synthetic fixture. Replace with the private competition dataset for the judged build." },
  outlets, vehicles, districtTravel, serviceAllowance, calendar,
  roadConditions: districts.map(([district], i) => ({ district, disruptionIndex: i % 4 === 0 ? 90 : 100 })),
  orders, fleetStatus, fuelUsedThisWeek, serviceHistory, deferralLog, weeklyVolume,
};
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(fixture));
console.log("Generated an independent synthetic demo seed. Supply the private competition CSVs for the judged build.");
