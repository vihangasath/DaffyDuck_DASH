// Contract between the API's /api/admin endpoints and apps/admin (types only).
import type { Brand, Depot, DockType, Parking, Role, Temp } from "./domain/types";
import type { OrderStatus } from "./views";

export interface DepotRow {
  id: Depot;
  name: string;
  district: string;
  address: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  outlets: number;
  vehicles: number;
  drivers: number;
}

export interface OutletRow {
  id: string;
  name: string;
  brand: Brand;
  district: string;
  depotId: Depot;
  dockType: DockType;
  parking: Parking;
  mallWindow: string | null;
  windowOpen: string;
  windowClose: string;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  active: boolean;
  managers: string[];
  ordersToday: number;
}

export interface VehicleRow {
  id: string;
  plateNo: string | null;
  type: "truck" | "van";
  temp: "reefer" | "ambient";
  weightCapKg: number;
  volumeCapM3: number;
  fuelType: string;
  kmPerL: number;
  weeklyFuelQuotaL: number;
  fuelUsedWeekL: number;
  depotId: Depot;
  status: "available" | "in_workshop";
  active: boolean;
  drivers: { id: string; name: string }[];
  tripsToday: number;
}

export interface DriverRow {
  id: string;
  name: string;
  phone: string | null;
  licenseNo: string | null;
  licenseClass: string | null;
  licenseExpiry: string | null;
  depotId: Depot;
  vehicleId: string | null;
  status: "active" | "on_leave" | "inactive";
  hiredOn: string | null;
  login: { userId: string; username: string; active: boolean } | null;
  deliveredToday: number;
}

export interface ProductRow {
  id: string;
  name: string;
  unit: string;
  brand: Brand;
  temp: Temp;
  weightKg: number;
  volumeM3: number;
  active: boolean;
}

export interface UserRow {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  depotId: Depot | null;
  outletId: string | null;
  outletScope: "outlet" | "depot" | null;
  driverId: string | null;
  /** What the account is attached to, in words: "VEH011 · Ruwan Silva", "OUT007 Rajagiriya", "Peliyagoda DC". */
  linkedTo: string;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  sessions: number;
}

export interface OrderRow {
  id: string;
  outletId: string;
  outletName: string;
  depot: Depot;
  brand: Brand;
  temp: Temp;
  units: number;
  volumeM3: number;
  status: OrderStatus;
  vehicleId: string | null;
  eta: string | null;
  deliveredAt: string | null;
  source: string;
  createdBy: string | null;
  forDate: string | null;
}

export interface ActivityRow {
  id: number;
  at: string;
  actor: string;
  role: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  summary: string;
}

export interface DepotToday {
  depot: Depot;
  name: string;
  ordersClosed: boolean;
  orders: number;
  plan: { version: number; status: "draft" | "published"; trips: number; deferred: number } | null;
  stops: number;
  delivered: number;
  failed: number;
  openExceptions: number;
}

export interface Overview {
  demoDate: string;
  counts: {
    outlets: { active: number; total: number };
    vehicles: { available: number; workshop: number; inactive: number; total: number };
    drivers: { active: number; onLeave: number; total: number };
    users: { active: number; total: number; byRole: Record<Role, number> };
    products: { active: number; total: number };
  };
  today: DepotToday[];
  alerts: { level: "danger" | "warning" | "info"; title: string; body: string; href: string }[];
  activity: ActivityRow[];
}

export interface Lookups {
  depots: { id: Depot; name: string }[];
  districts: { depot: Depot; district: string }[];
  vehicles: { id: string; depot: Depot; label: string; active: boolean }[];
  outlets: { id: string; depot: Depot; label: string; active: boolean }[];
  drivers: { id: string; depot: Depot; label: string; hasLogin: boolean }[];
}
