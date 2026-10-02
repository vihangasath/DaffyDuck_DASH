// Reference data comes from the master tables. The API hydrates @waypoint/core with it on start-up and
// after every admin change, so the planner and business rules always run on what the admin entered.
import { asc } from "drizzle-orm";
import { hydrate, type DepotInfo, type Reference } from "@waypoint/core/reference";
import type { SeedData } from "@waypoint/core/domain/network";
import type { Brand, Depot, DockType, Outlet, Parking, Temp, Vehicle } from "@waypoint/core/domain/types";
import type { Db } from "./db/client.ts";
import { applyPredictions } from "./models.ts";
import * as t from "./db/schema.ts";

export async function loadReference(db: Db): Promise<Reference> {
  const [depots, outlets, vehicles, products, travel, allowance, calendar, roads, history, weekly, meta] = await Promise.all([
    db.select().from(t.depots).orderBy(asc(t.depots.id)),
    db.select().from(t.outlets).orderBy(asc(t.outlets.id)),
    db.select().from(t.vehicles).orderBy(asc(t.vehicles.id)),
    db.select().from(t.products).orderBy(asc(t.products.brand), asc(t.products.id)),
    db.select().from(t.districtTravel),
    db.select().from(t.serviceAllowance),
    db.select().from(t.calendarDays).orderBy(asc(t.calendarDays.date)),
    db.select().from(t.roadConditions),
    db.select().from(t.serviceHistory).orderBy(asc(t.serviceHistory.outletId)),
    db.select().from(t.weeklyVolume).orderBy(asc(t.weeklyVolume.week)),
    db.select().from(t.appMeta),
  ]);
  const m = Object.fromEntries(meta.map((r) => [r.key, r.value])) as { dataset?: SeedData["meta"] };
  return {
    meta: m.dataset!,
    depots: depots.map((d): DepotInfo => ({ id: d.id as Depot, name: d.name, district: d.district, address: d.address, phone: d.phone, lat: d.lat, lng: d.lng })),
    outlets: outlets.map((o): Outlet => ({
      id: o.id, name: o.name, brand: o.brand as Brand, district: o.district, depot: o.depotId as Depot, dockType: o.dockType as DockType, parking: o.parking as Parking,
      mallWindow: o.mallWindow, windowOpen: o.windowOpen, windowClose: o.windowClose, lat: o.lat, lng: o.lng, phone: o.phone, active: o.active,
    })),
    vehicles: vehicles.map((v): Vehicle => ({
      id: v.id, plateNo: v.plateNo, type: v.type as Vehicle["type"], temp: v.temp as Vehicle["temp"], weightCapKg: v.weightCapKg, volumeCapM3: v.volumeCapM3,
      fuelType: v.fuelType, kmPerL: v.kmPerL, weeklyFuelQuotaL: v.weeklyFuelQuotaL, depot: v.depotId as Depot, active: v.active,
    })),
    products: products.map((p) => ({ id: p.id, name: p.name, unit: p.unit, brand: p.brand as Brand, temp: p.temp as Temp, weightKg: p.weightKg, volumeM3: p.volumeM3, active: p.active })),
    districtTravel: travel.map((d) => ({ ...d, depot: d.depotId as Depot })),
    serviceAllowance: allowance.map((a) => ({ brand: a.brand as Brand, dockType: a.dockType as DockType, minutes: a.minutes })),
    calendar: calendar.map((c) => ({ ...c })),
    roadConditions: roads,
    orders: [],
    fleetStatus: vehicles.map((v) => ({ vehicleId: v.id, status: v.status })),
    fuelUsedThisWeek: vehicles.map((v) => ({ vehicleId: v.id, km: v.fuelUsedWeekKm, litres: v.fuelUsedWeekL })),
    serviceHistory: history,
    deferralLog: [],
    weeklyVolume: weekly.map((w) => ({ depot: w.depotId, brand: w.brand as Brand, week: w.week, totalM3: w.totalM3, chilledM3: w.chilledM3, kind: w.kind as "actual" | "forecast" })),
  };
}

let current: Reference | null = null;
export const reference = () => current!;

/** Re-reads the master tables and hydrates the shared core modules. */
export async function refreshReference(db: Db) {
  current = applyPredictions(await loadReference(db));
  hydrate(current);
  return current;
}
