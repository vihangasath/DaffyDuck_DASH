// First-run seed: turns the bundled dataset (packages/core/src/seed.json, built from the competition
// CSVs) into master data, demo accounts and the start-of-day operational state.
// Drivers, plate numbers, phone numbers and licences are synthetic demo records: the datasets
// don't identify drivers, so one is generated per vehicle.
import { randomUUID } from "node:crypto";
import seedJson from "@waypoint/core/seed.json" with { type: "json" };
import { CATALOG } from "@waypoint/core/domain/catalog";
import { outletLatLng } from "@waypoint/core/domain/geo";
import { outletNames } from "@waypoint/core/domain/names";
import type { SeedData } from "@waypoint/core/domain/network";
import { depots as DEFAULT_DEPOTS } from "@waypoint/core/reference";
import { initialDb } from "@waypoint/core/ops";
import type { Role } from "@waypoint/core/domain/types";
import type { Db } from "./client.ts";
import * as t from "./schema.ts";
import { hashPassword } from "../auth.ts";
import { emptyOps, persist } from "../store.ts";
import { seedStaff } from "./staff-seed.ts";

export const dataset = seedJson as unknown as SeedData;

const FIRST = ["Chaminda", "Nuwan", "Saman", "Pradeep", "Dinesh", "Lasantha", "Asanka", "Kamal", "Sunil", "Mahesh", "Thilina", "Janaka", "Roshan", "Sampath", "Nalin", "Buddhika", "Gayan", "Isuru", "Chathura", "Tharindu", "Lahiru", "Sanjeewa", "Upul", "Ajith"];
const LAST = ["Perera", "Fernando", "Bandara", "Jayasuriya", "Rathnayake", "Gunawardena", "Herath", "Dissanayake", "Senanayake", "Kumara", "Ekanayake", "Weerasinghe", "Karunaratne", "Amarasinghe", "Liyanage", "Samarakoon"];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

interface DemoAccount {
  username: string;
  password: string;
  name: string;
  role: Role;
  depotId: string;
  outletId?: string;
  outletScope?: "outlet" | "depot";
  vehicleId?: string;
}

/** Listed in the README. Change these passwords in Waypoint People before any real use. */
const DEMO_ACCOUNTS: DemoAccount[] = [
  { username: "admin", password: "waypoint", name: "Anjali Wickramasinghe", role: "admin", depotId: "Peliyagoda" },
  { username: "dispatcher", password: "waypoint", name: "Nimali Perera", role: "dispatcher", depotId: "Peliyagoda" },
  { username: "loader", password: "waypoint", name: "Kasun Jayasinghe", role: "loader", depotId: "Peliyagoda" },
  { username: "driver", password: "waypoint", name: "Ruwan Silva", role: "driver", depotId: "Peliyagoda", vehicleId: "VEH011" },
  { username: "store", password: "waypoint", name: "Dilani Fernando", role: "store", depotId: "Peliyagoda", outletId: "OUT007", outletScope: "depot" },
];

const driverIdFor = (vehicleId: string) => vehicleId.replace(/^VEH/, "DRV");

export async function seedDatabase(db: Db) {
  const data = dataset;
  const names = outletNames(data.outlets);
  const fuel = new Map(data.fuelUsedThisWeek.map((f) => [f.vehicleId, f]));
  const status = new Map(data.fleetStatus.map((f) => [f.vehicleId, f.status]));
  const passwords = new Map(await Promise.all(DEMO_ACCOUNTS.map(async (a) => [a.username, await hashPassword(a.password)] as const)));

  await db.transaction(async (tx) => {
    await tx.insert(t.appMeta).values({ key: "dataset", value: data.meta });
    await tx.insert(t.depots).values(DEFAULT_DEPOTS.map((d) => ({ ...d, address: d.id === "Peliyagoda" ? "Negombo Road, Peliyagoda" : "Katugastota Road, Kandy", phone: d.id === "Peliyagoda" ? "+94 11 200 0001" : "+94 81 200 0001" })));
    await tx.insert(t.outlets).values(
      data.outlets.map((o) => {
        const name = names.get(o.id)!;
        const [lat, lng] = outletLatLng(o, name);
        return { ...o, depotId: o.depot, name, lat, lng, phone: `+94 11 ${String(2000000 + (hash(o.id) % 999999)).slice(0, 3)} ${String(hash(o.id) % 10000).padStart(4, "0")}` };
      }),
    );
    await tx.insert(t.vehicles).values(
      data.vehicles.map((v) => {
        const n = Number(v.id.replace(/\D/g, ""));
        return {
          ...v, depotId: v.depot, status: status.get(v.id) ?? "available",
          plateNo: `${v.depot === "Kandy" ? "CP" : "WP"} ${v.type === "van" ? "PD" : "LK"}-${String(1000 + ((n * 373) % 9000)).padStart(4, "0")}`,
          fuelUsedWeekL: fuel.get(v.id)?.litres ?? 0, fuelUsedWeekKm: fuel.get(v.id)?.km ?? 0,
        };
      }),
    );
    await tx.insert(t.drivers).values(
      data.vehicles.map((v, i) => {
        const account = DEMO_ACCOUNTS.find((a) => a.vehicleId === v.id);
        const h = hash(v.id);
        const year = 2027 + (h % 4);
        return {
          id: driverIdFor(v.id),
          // Unique first/last pairs for up to FIRST × LAST vehicles.
          name: account?.name ?? `${FIRST[i % FIRST.length]} ${LAST[(i + Math.floor(i / FIRST.length) * 3) % LAST.length]}`,
          phone: `+94 7${h % 8} ${String(h % 1000).padStart(3, "0")} ${String((h >>> 10) % 10000).padStart(4, "0")}`,
          licenseNo: `B${String(1000000 + (h % 8999999))}`,
          licenseClass: v.type === "van" ? "B" : "C1",
          // A few licences fall due soon so Waypoint People's renewals have something to show.
          licenseExpiry: i % 13 === 4 ? "2026-10-20" : `${year}-${String((h % 12) + 1).padStart(2, "0")}-${String((h % 27) + 1).padStart(2, "0")}`,
          depotId: v.depot,
          vehicleId: v.id,
          status: (i % 17 === 9 ? "on_leave" : "active") as "on_leave" | "active",
          hiredOn: `${2015 + (h % 10)}-${String((h % 12) + 1).padStart(2, "0")}-01`,
        };
      }),
    );
    await tx.insert(t.products).values(CATALOG.map((p) => ({ ...p, active: true })));
    await tx.insert(t.districtTravel).values(data.districtTravel.map((d) => ({ ...d, depotId: d.depot })));
    await tx.insert(t.serviceAllowance).values(data.serviceAllowance);
    await tx.insert(t.calendarDays).values(data.calendar);
    await tx.insert(t.roadConditions).values(data.roadConditions);
    await tx.insert(t.serviceHistory).values(data.serviceHistory);
    for (let i = 0; i < data.weeklyVolume.length; i += 200)
      await tx.insert(t.weeklyVolume).values(data.weeklyVolume.slice(i, i + 200).map((w) => ({ ...w, depotId: w.depot })));
    await tx.insert(t.users).values(
      DEMO_ACCOUNTS.map((a) => ({
        id: randomUUID(), username: a.username, passwordHash: passwords.get(a.username)!, displayName: a.name, role: a.role, depotId: a.depotId,
        outletId: a.outletId ?? null, outletScope: a.outletScope ?? null, driverId: a.vehicleId ? driverIdFor(a.vehicleId) : null,
      })),
    );
    await seedStaff(tx);
    const start = initialDb(data);
    await persist(tx, emptyOps(start.fleetStatus), start);
    await tx.insert(t.auditLog).values({ actor: "System", role: "system", action: "seed", summary: "Database created from the Tech-Triathlon 2026 dataset" });
  });
}
