// Demo sign-ins beyond the five named accounts (README): every branch's store manager signs in to
// their own branch, and the Kandy hub has its own loader and driver so its plan can be worked end to
// end. Each login is issued to the person HR already has on file. Runs once per database (an app_meta
// flag), so logins HR later turns off, renames or removes stay that way.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Tx } from "./client.ts";
import * as t from "./schema.ts";
import { hashPassword } from "../auth.ts";

const FLAG = "demo-logins";
const PASSWORD = "waypoint";

/** `store-out012` for OUT012's manager; the named demo `store` account keeps OUT007. */
const storeUsername = (outletId: string) => `store-${outletId.toLowerCase()}`;

export async function ensureDemoLogins(tx: Tx): Promise<number> {
  const [done] = await tx.select().from(t.appMeta).where(eq(t.appMeta.key, FLAG));
  if (done) return 0;

  const taken = new Set((await tx.select({ u: t.users.username }).from(t.users)).map((r) => r.u));
  const linked = new Set((await tx.select({ s: t.users.staffId }).from(t.users)).map((r) => r.s));
  const people = (await tx.select().from(t.staff).orderBy(t.staff.id)).filter((s) => s.status !== "left" && !linked.has(s.id));
  const drivers = new Map((await tx.select().from(t.drivers)).map((d) => [d.id, d]));
  const vehicles = new Map((await tx.select().from(t.vehicles)).map((v) => [v.id, v]));

  const wanted: { username: string; staff: (typeof people)[number]; role: "store" | "loader" | "driver" }[] = [];
  for (const s of people) if (s.jobRole === "store_manager" && s.outletId) wanted.push({ username: storeUsername(s.outletId), staff: s, role: "store" });
  const kandyLoader = people.find((s) => s.jobRole === "loader" && s.depotId === "Kandy" && s.status === "active");
  if (kandyLoader) wanted.push({ username: "loader-kandy", staff: kandyLoader, role: "loader" });
  const kandyDriver = people.find((s) => {
    const d = s.driverId ? drivers.get(s.driverId) : undefined;
    return s.jobRole === "driver" && s.status === "active" && d?.status === "active" && !!d.vehicleId && vehicles.get(d.vehicleId)?.depotId === "Kandy" && vehicles.get(d.vehicleId)?.status === "available";
  });
  if (kandyDriver) wanted.push({ username: "driver-kandy", staff: kandyDriver, role: "driver" });

  const fresh = wanted.filter((w) => !taken.has(w.username));
  // One salted hash per account, like any other login.
  const hashes = await Promise.all(fresh.map(() => hashPassword(PASSWORD)));
  const rows = fresh.map((w, i) => ({
    id: randomUUID(), username: w.username, passwordHash: hashes[i], displayName: w.staff.name, role: w.role,
    depotId: w.staff.depotId, outletId: w.role === "store" ? w.staff.outletId : null, driverId: w.role === "driver" ? w.staff.driverId : null, staffId: w.staff.id,
  }));
  for (let i = 0; i < rows.length; i += 200) await tx.insert(t.users).values(rows.slice(i, i + 200));
  await tx.insert(t.appMeta).values({ key: FLAG, value: { issued: rows.length, at: new Date().toISOString() } });
  if (rows.length)
    await tx.insert(t.auditLog).values({ actor: "System", role: "system", action: "user.create", entity: "user", summary: `Issued ${rows.length} demo logins (a store manager per branch, Kandy loader and driver)` });
  return rows.length;
}
