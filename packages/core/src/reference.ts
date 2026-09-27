// Reference data (depots, outlets, vehicles, products, travel, calendar, history) used by the planner
// and every screen. It starts from the bundled seed; the API loads it from the database and the web
// app hydrates it from the API, so admin edits reach every screen without changing call sites.
import seedJson from "./seed.json";
import { CATALOG, type Sku } from "./domain/catalog";
import { buildContext, buildNetwork, type SeedData } from "./domain/network";
import { outletNames } from "./domain/names";
import type { Depot, Order } from "./domain/types";
import type { EvalContext } from "./planner/evaluate";

export interface DepotInfo {
  id: Depot;
  name: string;
  district: string;
  address: string | null;
  phone: string | null;
  lat: number;
  lng: number;
}

/** Everything the API serves as reference data. */
export interface Reference extends SeedData {
  depots: DepotInfo[];
  products: Sku[];
}

export const seed = structuredClone(seedJson) as unknown as SeedData;
export const DEMO_DATE = seed.meta.demoDate;
export const net = buildNetwork(seed);
export const names = new Map(outletNames(seed.outlets));
export const demoDay = seed.calendar.find((c) => c.date === DEMO_DATE)!;
export const festivalRamp = demoDay.festivalRamp;
export const depots: DepotInfo[] = [
  { id: "Peliyagoda", name: "Peliyagoda DC", district: "Gampaha", address: null, phone: null, lat: 6.965, lng: 79.883 },
  { id: "Kandy", name: "Kandy hub", district: "Kandy", address: null, phone: null, lat: 7.275, lng: 80.615 },
];

/** Replaces the reference data in place: every importer of `seed`, `net`, `names` and `CATALOG` sees it. */
export function hydrate(ref: Reference) {
  Object.assign(seed, ref);
  Object.assign(net, buildNetwork(seed));
  names.clear();
  for (const o of seed.outlets) names.set(o.id, o.name ?? o.id);
  CATALOG.splice(0, CATALOG.length, ...ref.products);
  depots.splice(0, depots.length, ...ref.depots);
}

export const outletName = (id: string) => names.get(id) ?? id;
export const outletLabel = (id: string) => {
  const o = net.outlets.get(id);
  return o ? `${o.brand} · ${outletName(id)}` : id;
};
export const depotName = (id: string) => depots.find((d) => d.id === id)?.name ?? id;

export function contextFor(orders: Order[], fleet: Record<string, string>): EvalContext {
  return buildContext(
    net,
    orders,
    // An inactive (retired) vehicle is never offered to the planner.
    Object.entries(fleet).map(([vehicleId, status]) => ({
      vehicleId,
      status: net.vehicles.get(vehicleId)?.active === false ? "in_workshop" : (status as "available" | "in_workshop"),
    })),
    seed.fuelUsedThisWeek,
  );
}
