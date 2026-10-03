// Builds the HR staff directory from what the database already holds: one record per driver, one per
// demo account, a store manager per branch, and a few synthetic loaders, dispatchers and HR officers so
// every role has people in it. Runs on first seed, and once on start-up for databases created before
// the staff table existed. Names, phones and dates are synthetic demo records.
import { eq } from "drizzle-orm";
import type { JobRole } from "@waypoint/core/people";
import type { Tx } from "./client.ts";
import * as t from "./schema.ts";

const WOMEN = ["Anusha", "Dilhani", "Sachini", "Nadeesha", "Chamari", "Ishara", "Tharushi", "Piumi", "Kaushalya", "Hasini", "Madhavi", "Shanika", "Nirosha", "Gayani", "Ruwini", "Sewwandi"];
const MEN = ["Harsha", "Ravindu", "Chanaka", "Pasindu", "Dulaj", "Kavinda", "Supun", "Malith", "Hiran", "Nimesh", "Sahan", "Janith", "Dimuth", "Akila", "Oshada", "Yasiru"];
const LAST = ["Gamage", "Rodrigo", "Wijesinghe", "Abeysekara", "Munasinghe", "Pathirana", "Kulatunga", "Hettiarachchi", "Ranasinghe", "de Silva", "Jayawardena", "Premadasa", "Siriwardena", "Kodikara", "Mendis", "Wanigasekara"];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 11);
const day = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400_000);
const phone = (key: string) => {
  const h = hash(key);
  return `+94 7${h % 8} ${String(h % 1000).padStart(3, "0")} ${String((h >>> 10) % 10000).padStart(4, "0")}`;
};

interface Draft {
  name: string;
  jobRole: JobRole;
  depotId: string;
  outletId?: string | null;
  driverId?: string | null;
  phone?: string | null;
  status?: "active" | "on_leave" | "left";
  leaveUntil?: string | null;
  startedOn?: string | null;
  leftOn?: string | null;
}

export async function seedStaff(tx: Tx, now = new Date()) {
  // One transaction is one connection: its queries run one after another.
  const drivers = await tx.select().from(t.drivers).orderBy(t.drivers.id);
  const users = await tx.select().from(t.users).orderBy(t.users.createdAt);
  const outlets = await tx.select().from(t.outlets).orderBy(t.outlets.id);
  let n = 0;
  const person = (key: string, i: number) => {
    const h = hash(key);
    const first = (h % 2 ? WOMEN : MEN)[(i + h) % 16];
    return `${first} ${LAST[(i * 5 + (h >>> 4)) % LAST.length]}`;
  };
  const started = (key: string, from = 2014, span = 11) => {
    const h = hash(key);
    return `${from + (h % span)}-${String((h % 12) + 1).padStart(2, "0")}-${String((h % 27) + 1).padStart(2, "0")}`;
  };
  const drafts: Draft[] = [];
  const accountFor = new Map<number, string>(); // draft index → user id

  const account = (role: string) => users.filter((u) => u.role === role);
  const demo = (role: string, jobRole: JobRole) => {
    for (const u of account(role)) {
      if (role === "driver") continue;
      accountFor.set(drafts.length, u.id);
      drafts.push({
        name: u.displayName, jobRole, depotId: u.depotId ?? "Peliyagoda", outletId: u.outletId, phone: phone(u.username),
        startedOn: started(u.username, 2016, 8),
      });
    }
  };

  // HR first, then the depot teams, then drivers, then a manager per branch.
  demo("admin", "hr_officer");
  drafts.push({ name: "Shanika Rodrigo", jobRole: "hr_officer", depotId: "Peliyagoda", phone: phone("hr-2"), startedOn: day(addDays(now, -41)) });
  demo("dispatcher", "dispatcher");
  drafts.push({ name: "Harsha Gamage", jobRole: "dispatcher", depotId: "Kandy", phone: phone("disp-k"), startedOn: started("disp-k") });
  drafts.push({ name: "Sachini Wijesinghe", jobRole: "dispatcher", depotId: "Peliyagoda", phone: phone("disp-p2"), startedOn: started("disp-p2") });
  demo("loader", "loader");
  for (const [depot, count] of [["Peliyagoda", 5], ["Kandy", 3]] as const)
    for (let i = 0; i < count; i++) {
      const key = `loader-${depot}-${i}`;
      const onLeave = depot === "Peliyagoda" && i === 2;
      drafts.push({
        name: person(key, i + (depot === "Kandy" ? 7 : 0)), jobRole: "loader", depotId: depot, phone: phone(key),
        startedOn: depot === "Kandy" && i === 2 ? day(addDays(now, -12)) : started(key),
        status: onLeave ? "on_leave" : "active", leaveUntil: onLeave ? day(addDays(now, 9)) : null,
      });
    }
  const driverAccounts = new Map(account("driver").map((u) => [u.driverId, u.id]));
  for (const d of drivers) {
    const uid = driverAccounts.get(d.id);
    if (uid) accountFor.set(drafts.length, uid);
    const status = d.status === "inactive" ? "left" : d.status;
    drafts.push({
      name: d.name, jobRole: "driver", depotId: d.depotId, driverId: d.id, phone: d.phone, startedOn: d.hiredOn,
      status, leaveUntil: status === "on_leave" ? day(addDays(now, 4 + (hash(d.id) % 10))) : null, leftOn: status === "left" ? day(now) : null,
    });
  }
  const managed = new Set(account("store").map((u) => u.outletId));
  demo("store", "store_manager");
  outlets.forEach((o, i) => {
    if (managed.has(o.id)) return;
    const key = `mgr-${o.id}`;
    const left = i === 17;
    drafts.push({
      name: person(key, i), jobRole: "store_manager", depotId: o.depotId, outletId: o.id, phone: phone(key), startedOn: started(key, 2017, 8),
      status: left ? "left" : i % 23 === 5 ? "on_leave" : "active",
      leaveUntil: !left && i % 23 === 5 ? day(addDays(now, 6)) : null, leftOn: left ? day(addDays(now, -20)) : null,
    });
  });

  const rows = drafts.map((d) => ({
    id: `EMP${String(++n).padStart(4, "0")}`,
    name: d.name, jobRole: d.jobRole, depotId: d.depotId, outletId: d.outletId ?? null, driverId: d.driverId ?? null,
    phone: d.phone ?? null, synthetic: true, status: d.status ?? ("active" as const), leaveUntil: d.leaveUntil ?? null, startedOn: d.startedOn ?? null, leftOn: d.leftOn ?? null,
  }));
  for (let i = 0; i < rows.length; i += 200) await tx.insert(t.staff).values(rows.slice(i, i + 200));
  for (const [i, userId] of accountFor) await tx.update(t.users).set({ staffId: rows[i].id }).where(eq(t.users.id, userId));
  // Keep the operational driver status in step with HR.
  for (const r of rows) if (r.driverId && r.status === "left") await tx.update(t.drivers).set({ status: "inactive" }).where(eq(t.drivers.id, r.driverId));
  return rows.length;
}

/** For databases created before Waypoint People: fill the directory once. */
export async function ensureStaff(tx: Tx) {
  const [any] = await tx.select({ id: t.staff.id }).from(t.staff).limit(1);
  if (any) return 0;
  const [driver] = await tx.select({ id: t.drivers.id }).from(t.drivers).limit(1);
  if (!driver) return 0;
  return seedStaff(tx);
}
