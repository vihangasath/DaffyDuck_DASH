// Domain model shared by the UI, the planner and (later) the API.
// Field names mirror the shared CSVs, camel-cased.

export type Brand = "Fresh" | "Style" | "Tech";
export type Depot = "Peliyagoda" | "Kandy";
export type Temp = "chilled" | "ambient";
export type DockType = "rear_dock" | "street" | "mall_bay";
export type Parking = "normal" | "van_only" | "mall_dock";
export type Role = "admin" | "dispatcher" | "loader" | "driver" | "store";

export interface Outlet {
  id: string;
  brand: Brand;
  district: string;
  depot: Depot;
  dockType: DockType;
  parking: Parking;
  mallWindow: string | null; // "HH:MM-HH:MM"
  windowOpen: string;
  windowClose: string;
  /** Stored in the database; the seed derives them (names.ts, geo.ts). */
  name?: string;
  lat?: number | null;
  lng?: number | null;
  phone?: string | null;
  active?: boolean;
}

export interface Vehicle {
  id: string;
  type: "truck" | "van";
  temp: "reefer" | "ambient";
  weightCapKg: number;
  volumeCapM3: number;
  fuelType: string;
  kmPerL: number;
  weeklyFuelQuotaL: number;
  depot: Depot;
  plateNo?: string | null;
  active?: boolean;
}

export interface DistrictTravel {
  district: string;
  depot: Depot;
  roadClass: string;
  freeFlowKmh: number;
  depotToDistrictKm: number;
  depotToDistrictMin: number;
  interStopKm: number;
  interStopMin: number;
}

export interface ServiceAllowance {
  brand: Brand;
  dockType: DockType;
  minutes: number;
}

export interface CalendarDay {
  date: string;
  dow: number;
  isoYear: number;
  isoWeek: number;
  payday: boolean;
  festival: string | null;
  festivalRamp: number;
  holiday: boolean;
  monsoon: boolean;
  operating: boolean;
}

export interface Order {
  id: string;
  outletId: string;
  depot: Depot;
  brand: Brand;
  temp: Temp;
  units: number;
  weightKg: number;
  volumeM3: number;
  deferredYesterday: boolean;
  daysSinceLastServed: number;
  source: string;
  /** Delivery date the order is for. */
  forDate?: string;
  createdAt?: string;
  createdBy?: string;
  /** Stored order lines. Seeded orders only carry totals, so their lines are derived once and stored. */
  lines?: OrderLine[];
}

export interface OrderLine {
  skuId: string;
  name: string;
  unit: string;
  qty: number;
}

export type VehicleStatus = "available" | "in_workshop";

/** Static reference data the planner needs. */
export interface Network {
  outlets: Map<string, Outlet>;
  vehicles: Map<string, Vehicle>;
  travel: Map<string, DistrictTravel>;
  allowance: (brand: Brand, dock: DockType) => number;
  /** Road disruption index for the plan date, 100 = normal (road_conditions). */
  disruption: (district: string) => number;
}

export interface Trip {
  id: string;
  vehicleId: string;
  tripNo: 1 | 2;
  brand: Brand;
  district: string;
  /** Order ids; the planner keeps them in delivery sequence. */
  orderIds: string[];
}

export type DeferralCode =
  | "REEFER_CAPACITY"
  | "VAN_CAPACITY"
  | "FRESH_WINDOW"
  | "DAY_BUDGET"
  | "MALL_WINDOW"
  | "FUEL_QUOTA"
  | "CAPACITY"
  | "OVERSIZE"
  | "NO_VEHICLE"
  | "MANUAL";

export interface Deferral {
  orderId: string;
  code: DeferralCode;
  reason: string;
  note?: string;
  decidedBy: string; // "Auto-plan" or a user name
  decidedAt: string;
}

export interface Plan {
  date: string;
  depot: Depot;
  version: number;
  status: "draft" | "published";
  publishedAt?: string;
  trips: Trip[];
  deferred: Deferral[];
}
