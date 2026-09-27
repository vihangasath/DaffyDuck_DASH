// Contract between the API's /api/network endpoints and the dispatcher's Network records screens in
// apps/web (types only). People records for HR are in people.ts.
import type { Brand, Depot, DockType, Parking, Temp } from "./domain/types";

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

export interface NetworkLookups {
  depots: { id: Depot; name: string }[];
  districts: { depot: Depot; district: string }[];
  /** Drivers who can run a vehicle (not left), for the vehicle's driver assignment. */
  drivers: { id: string; depot: Depot; name: string; vehicleId: string | null; onLeave: boolean }[];
}
