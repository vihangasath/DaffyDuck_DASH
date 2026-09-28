import type { Brand, CalendarDay, DistrictTravel, DockType, Network, Order, Outlet, ServiceAllowance, Vehicle, VehicleStatus } from "./types";
import type { EvalContext } from "../planner/evaluate";

export interface SeedData {
  meta: {
    demoDate: string;
    historyDays: string[];
    pastWeeks: string[];
    futureWeeks: { week: string; start: string; end: string; festival: string | null; maxRamp: number; payday: boolean; operatingDays: number }[];
  };
  outlets: Outlet[];
  vehicles: Vehicle[];
  districtTravel: DistrictTravel[];
  serviceAllowance: ServiceAllowance[];
  calendar: CalendarDay[];
  roadConditions: { district: string; disruptionIndex: number }[];
  orders: Order[];
  fleetStatus: { vehicleId: string; status: VehicleStatus }[];
  fuelUsedThisWeek: { vehicleId: string; km: number; litres: number }[];
  serviceHistory: { outletId: string; days: string }[];
  deferralLog: {
    orderId: string; date: string; outletId: string; brand: Brand; temp: string; volumeM3: number;
    outcome: string; reason: string; decidedBy: string; storeNotified: boolean;
  }[];
  weeklyVolume: { depot: string; brand: Brand; week: string; totalM3: number; chilledM3: number; kind: "actual" | "forecast" }[];
}

export function buildNetwork(seed: Pick<SeedData, "outlets" | "vehicles" | "districtTravel" | "serviceAllowance" | "roadConditions">): Network {
  const allowance = new Map(seed.serviceAllowance.map((a) => [`${a.brand}|${a.dockType}`, a.minutes]));
  const roads = new Map(seed.roadConditions.map((r) => [r.district, r.disruptionIndex]));
  return {
    outlets: new Map(seed.outlets.map((o) => [o.id, o])),
    vehicles: new Map(seed.vehicles.map((v) => [v.id, v])),
    travel: new Map(seed.districtTravel.map((d) => [d.district, d])),
    allowance: (brand: Brand, dock: DockType) => allowance.get(`${brand}|${dock}`) ?? 20,
    disruption: (district: string) => roads.get(district) ?? 100,
  };
}

export function buildContext(
  net: Network,
  orders: Order[],
  fleetStatus: SeedData["fleetStatus"],
  fuel: SeedData["fuelUsedThisWeek"],
): EvalContext {
  return {
    net,
    orders: new Map(orders.map((o) => [o.id, o])),
    available: new Set(fleetStatus.filter((f) => f.status === "available").map((f) => f.vehicleId)),
    fuelUsedL: new Map(fuel.map((f) => [f.vehicleId, f.litres])),
  };
}
