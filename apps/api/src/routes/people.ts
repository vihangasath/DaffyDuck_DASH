// Waypoint People (HR) endpoints: the staff directory for every role, driving licences, sign-in access
// and the people/access activity log. HR role only (internal key `admin`); every write is audited.
// Network records (vehicles, depots, branches, products) belong to dispatch: routes/network.ts.
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { and, count, desc, eq, ilike, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { APP_ROLE, JOB_LABEL, type JobRole, type PeopleActivity, type PeopleLookups, type PeopleOverview, type StaffRow } from "@waypoint/core/people";
import type { Depot } from "@waypoint/core/domain/types";
import { daysBetween } from "@waypoint/core/domain/time";
import { OpError } from "@waypoint/core/ops";
import { depotName, outletName } from "@waypoint/core/reference";
import * as t from "../db/schema.ts";
import { hashPassword, passwordProblem, revokeUserSessions } from "../auth.ts";
import { body, requireAuth, type Env } from "../http.ts";
import { iso } from "../store.ts";
import type { AuditEntry } from "../service.ts";
import type { Tx } from "../db/client.ts";

const DepotId = z.enum(["Peliyagoda", "Kandy"]);
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const opt = <T extends z.ZodType>(s: T) => s.nullable().optional();
const text = (max = 120) => z.string().trim().min(1).max(max);
const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);
const blank = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

const Staff = z.object({
  name: text(80),
  jobRole: z.enum(["driver", "loader", "dispatcher", "store_manager", "hr_officer"]),
  depotId: DepotId,
  outletId: opt(z.string().max(20)),
  phone: opt(z.string().max(30)),
  email: opt(z.string().trim().max(120).regex(/^$|^[^@\s]+@[^@\s]+\.[^@\s]+$/, "enter an email address like name@example.com")),
  emergencyContact: opt(z.string().max(120)),
  status: z.enum(["active", "on_leave", "left"]),
  leaveUntil: opt(Day),
  startedOn: opt(Day),
  leftOn: opt(Day),
  licenseNo: opt(z.string().max(30)),
  licenseClass: opt(z.string().max(10)),
  licenseExpiry: opt(Day),
});
type StaffIn = z.infer<typeof Staff>;

const Username = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,32}$/, "3–32 letters, digits, dots, dashes or underscores");
const NewLogin = z.object({ username: Username, password: z.string().min(1).max(200) });
const LoginPatch = z.object({ active: z.boolean() });

function need<T>(v: T | undefined | null, what: string): T {
  if (v == null) throw new OpError(404, `${what} not found.`);
  return v;
}

export const peopleRoutes = new Hono<Env>().use(requireAuth("admin"));

const who = (c: { var: Env["Variables"] }): Pick<AuditEntry, "userId" | "actor" | "role"> => ({ userId: c.var.auth.user.userId, actor: c.var.auth.user.name, role: "hr" });

// ── Reading the directory ──────────────────────────────────────────────────────────────────────

async function loadStaff(db: Env["Variables"]["svc"]["db"]): Promise<StaffRow[]> {
  const [staff, drivers, users, sessions] = await Promise.all([
    db.select().from(t.staff).orderBy(t.staff.id),
    db.select().from(t.drivers),
    db.select().from(t.users),
    db.select({ userId: t.sessions.userId, n: count() }).from(t.sessions).where(sql`${t.sessions.expiresAt} > now()`).groupBy(t.sessions.userId),
  ]);
  const driverById = new Map(drivers.map((d) => [d.id, d]));
  const userByStaff = new Map(users.filter((u) => u.staffId).map((u) => [u.staffId!, u]));
  return staff.map((s): StaffRow => {
    const d = s.driverId ? driverById.get(s.driverId) : undefined;
    const u = userByStaff.get(s.id);
    return {
      id: s.id, name: s.name, jobRole: s.jobRole, depotId: s.depotId as Depot, outletId: s.outletId,
      outletName: s.outletId ? `${s.outletId} ${outletName(s.outletId)}` : null,
      phone: s.phone, email: s.email, emergencyContact: s.emergencyContact, status: s.status,
      leaveUntil: s.leaveUntil, startedOn: s.startedOn, leftOn: s.leftOn, synthetic: s.synthetic,
      driver: d ? { id: d.id, licenseNo: d.licenseNo, licenseClass: d.licenseClass, licenseExpiry: d.licenseExpiry, vehicleId: d.vehicleId } : null,
      login: u
        ? {
            userId: u.id, username: u.username, active: u.active, lastLoginAt: iso(u.lastLoginAt) ?? null,
            sessions: Number(sessions.find((x) => x.userId === u.id)?.n ?? 0),
          }
        : null,
    };
  });
}

function activityRow(a: typeof t.auditLog.$inferSelect): PeopleActivity {
  return { id: a.id, at: iso(a.at)!, actor: a.actor, role: a.role, action: a.action, entity: a.entity, entityId: a.entityId, summary: a.summary };
}

/** What HR's log shows: people records, sign-in access, and sign-ins. Operations and network edits stay with dispatch. */
const PEOPLE_LOG = sql`(${t.auditLog.action} like 'staff.%' or ${t.auditLog.action} like 'driver.%' or ${t.auditLog.action} like 'user.%' or ${t.auditLog.action} like 'auth.%')`;

peopleRoutes.get("/overview", async (c) => {
  const { db } = c.var.svc;
  const [rows, activity] = await Promise.all([loadStaff(db), db.select().from(t.auditLog).where(PEOPLE_LOG).orderBy(desc(t.auditLog.id)).limit(10)]);
  const day = today();
  const current = rows.filter((r) => r.status !== "left");
  const zero = (): Record<JobRole, number> => ({ driver: 0, loader: 0, dispatcher: 0, store_manager: 0, hr_officer: 0 });
  const roster = (["Peliyagoda", "Kandy"] as Depot[]).map((depot) => {
    const here = current.filter((r) => r.depotId === depot);
    const byRole = zero();
    for (const r of here) byRole[r.jobRole]++;
    return { depot, name: depotName(depot), byRole, onLeave: here.filter((r) => r.status === "on_leave").length };
  });
  const renewals = current
    .filter((r) => r.driver?.licenseExpiry && daysBetween(day, r.driver.licenseExpiry) <= 90)
    .map((r) => ({ staffId: r.id, name: r.name, depotId: r.depotId, licenseNo: r.driver!.licenseNo, licenseExpiry: r.driver!.licenseExpiry!, days: daysBetween(day, r.driver!.licenseExpiry!) }))
    .sort((a, b) => a.days - b.days);
  const logins = rows.map((r) => r.login).filter((l) => l != null);
  return c.json({
    today: day,
    headcount: { total: rows.length, active: rows.filter((r) => r.status === "active").length, onLeave: rows.filter((r) => r.status === "on_leave").length, left: rows.filter((r) => r.status === "left").length },
    roster,
    renewals,
    onLeave: current.filter((r) => r.status === "on_leave").map((r) => ({ staffId: r.id, name: r.name, jobRole: r.jobRole, depotId: r.depotId, leaveUntil: r.leaveUntil })).sort((a, b) => (a.leaveUntil ?? "9").localeCompare(b.leaveUntil ?? "9")),
    noLogin: current.filter((r) => r.status === "active" && !r.login).map((r) => ({ staffId: r.id, name: r.name, jobRole: r.jobRole, depotId: r.depotId })),
    joiners: current
      .filter((r) => r.startedOn && daysBetween(r.startedOn, day) >= 0 && daysBetween(r.startedOn, day) <= 60)
      .map((r) => ({ staffId: r.id, name: r.name, jobRole: r.jobRole, depotId: r.depotId, startedOn: r.startedOn! }))
      .sort((a, b) => b.startedOn.localeCompare(a.startedOn)),
    access: { active: logins.filter((l) => l.active).length, disabled: logins.filter((l) => !l.active).length, signedInToday: logins.filter((l) => l.lastLoginAt?.slice(0, 10) === day).length },
    activity: activity.map(activityRow),
  } satisfies PeopleOverview);
});

peopleRoutes.get("/lookups", async (c) => {
  const { db } = c.var.svc;
  const [depots, outlets] = await Promise.all([db.select().from(t.depots), db.select().from(t.outlets).orderBy(t.outlets.id)]);
  return c.json({
    depots: depots.map((d) => ({ id: d.id as Depot, name: d.name })),
    outlets: outlets.map((o) => ({ id: o.id, depot: o.depotId as Depot, label: `${o.id} · ${o.brand} ${o.name}`, active: o.active })),
  } satisfies PeopleLookups);
});

peopleRoutes.get("/staff", async (c) => c.json(await loadStaff(c.var.svc.db)));

// ── Writing the directory ──────────────────────────────────────────────────────────────────────

/** Normalises a staff record: the branch decides a store manager's depot, leave and leaving dates follow the status. */
async function shapeStaff(tx: Tx, x: StaffIn) {
  let depotId: string = x.depotId;
  let outletId: string | null = null;
  if (x.jobRole === "store_manager") {
    if (!x.outletId) throw new OpError(400, "Choose the branch this store manager runs.");
    const [o] = await tx.select().from(t.outlets).where(eq(t.outlets.id, x.outletId));
    if (!o) throw new OpError(400, `Branch ${x.outletId} doesn’t exist.`);
    depotId = o.depotId;
    outletId = o.id;
  }
  if (x.status === "on_leave" && x.leaveUntil && x.leaveUntil < today()) throw new OpError(400, "The return date is in the past. Set them back to active, or choose a later date.");
  return {
    name: x.name, jobRole: x.jobRole, depotId, outletId,
    phone: blank(x.phone), email: blank(x.email)?.toLowerCase() ?? null, emergencyContact: blank(x.emergencyContact),
    status: x.status,
    leaveUntil: x.status === "on_leave" ? (x.leaveUntil ?? null) : null,
    startedOn: x.startedOn ?? null,
    leftOn: x.status === "left" ? (x.leftOn ?? today()) : null,
  };
}

const driverStatus = (s: StaffIn["status"]) => (s === "left" ? "inactive" : s);

/** Next free id with a prefix and width: EMP0114, DRV039. */
async function nextId(tx: Tx, table: typeof t.staff | typeof t.drivers, prefix: string, width: number) {
  const rows = await tx.select({ id: table.id }).from(table);
  const max = Math.max(0, ...rows.map((r) => Number(r.id.replace(/\D/g, "")) || 0));
  return `${prefix}${String(max + 1).padStart(width, "0")}`;
}

/** Someone leaving loses sign-in at once; an HR officer can't remove the last HR access or their own. */
async function guardAccess(tx: Tx, me: string, userId: string, losingHr: boolean) {
  if (userId === me) throw new OpError(409, "You can’t remove your own access. Ask another HR officer.");
  if (!losingHr) return;
  const [{ n }] = await tx.select({ n: count() }).from(t.users).where(and(eq(t.users.role, "admin"), eq(t.users.active, true), ne(t.users.id, userId)));
  if (!Number(n)) throw new OpError(409, "Keep at least one HR officer who can sign in to Waypoint People.");
}

peopleRoutes.post("/staff", async (c) => {
  const x = await body(c, Staff);
  const id = await c.var.svc.master<string>(
    (id: string) => ({ ...who(c), action: "staff.create", entity: "staff", entityId: id, summary: `Added ${x.name} (${id}) as ${JOB_LABEL[x.jobRole].toLowerCase()} at ${depotName(x.depotId)}` }),
    async (tx) => {
      const s = await shapeStaff(tx, x);
      const id = await nextId(tx, t.staff, "EMP", 4);
      let driverId: string | null = null;
      if (x.jobRole === "driver") {
        driverId = await nextId(tx, t.drivers, "DRV", 3);
        await tx.insert(t.drivers).values({
          id: driverId, name: s.name, phone: s.phone, licenseNo: blank(x.licenseNo), licenseClass: blank(x.licenseClass), licenseExpiry: x.licenseExpiry ?? null,
          depotId: s.depotId, vehicleId: null, status: driverStatus(x.status), hiredOn: s.startedOn,
        });
      }
      await tx.insert(t.staff).values({ ...s, id, driverId });
      return id;
    },
  );
  return c.json({ id }, 201);
});

peopleRoutes.patch("/staff/:id", async (c) => {
  const id = c.req.param("id");
  const x = await body(c, Staff);
  const me = c.var.auth.user.userId;
  await c.var.svc.master(
    () => ({ ...who(c), action: "staff.update", entity: "staff", entityId: id, summary: `Updated ${x.name} (${id}) · ${JOB_LABEL[x.jobRole].toLowerCase()} · ${x.status === "on_leave" ? "on leave" : x.status}`, detail: x }),
    async (tx) => {
      const [cur] = await tx.select().from(t.staff).where(eq(t.staff.id, id));
      need(cur, "Staff record");
      if ((cur.jobRole === "driver") !== (x.jobRole === "driver"))
        throw new OpError(400, "A driver’s record stays a driver record, because it carries their licence and vehicle. Mark them as left and add a new record for the new job.");
      const s = await shapeStaff(tx, x);
      await tx.update(t.staff).set({ ...s, updatedAt: now() }).where(eq(t.staff.id, id));

      if (cur.driverId) {
        const [d] = await tx.select().from(t.drivers).where(eq(t.drivers.id, cur.driverId));
        // A driver who leaves, or moves depot, gives their vehicle back to dispatch.
        const [v] = d?.vehicleId ? await tx.select().from(t.vehicles).where(eq(t.vehicles.id, d.vehicleId)) : [];
        const keepVehicle = x.status !== "left" && (!v || v.depotId === s.depotId);
        await tx.update(t.drivers).set({
          name: s.name, phone: s.phone, licenseNo: blank(x.licenseNo), licenseClass: blank(x.licenseClass), licenseExpiry: x.licenseExpiry ?? null,
          depotId: s.depotId, status: driverStatus(x.status), hiredOn: s.startedOn, updatedAt: now(), ...(keepVehicle ? {} : { vehicleId: null }),
        }).where(eq(t.drivers.id, cur.driverId));
      }

      const [u] = await tx.select().from(t.users).where(eq(t.users.staffId, id));
      if (!u) return;
      const role = APP_ROLE[x.jobRole];
      const leaving = x.status === "left" && u.active;
      if (leaving || (u.role === "admin" && role !== "admin")) await guardAccess(tx, me, u.id, u.role === "admin");
      const next = {
        displayName: s.name, role, depotId: s.depotId, outletId: s.outletId,
        driverId: cur.driverId,
        active: leaving ? false : u.active, updatedAt: now(),
      };
      await tx.update(t.users).set(next).where(eq(t.users.id, u.id));
      // New job, new workplace or leaving: they sign in again with the new rights (or not at all).
      if (leaving || role !== u.role || next.depotId !== u.depotId || next.outletId !== u.outletId) await revokeUserSessions(tx as never, u.id);
    },
  );
  return c.json({ ok: true });
});

// ── Sign-in access ─────────────────────────────────────────────────────────────────────────────

peopleRoutes.post("/staff/:id/login", async (c) => {
  const id = c.req.param("id");
  const x = await body(c, NewLogin);
  const problem = passwordProblem(x.password);
  if (problem) throw new OpError(400, `Password: ${problem}`);
  const hash = await hashPassword(x.password);
  const userId = await c.var.svc.master<string>(
    () => ({ ...who(c), action: "user.create", entity: "staff", entityId: id, summary: `Issued the login “${x.username}” to ${id}` }),
    async (tx) => {
      const [s] = await tx.select().from(t.staff).where(eq(t.staff.id, id));
      need(s, "Staff record");
      if (s.status === "left") throw new OpError(409, `${s.name} has left Waypoint, so they can’t have a login.`);
      const [has] = await tx.select({ id: t.users.id }).from(t.users).where(eq(t.users.staffId, id));
      if (has) throw new OpError(409, `${s.name} already has a login. Reset its password instead.`);
      const role = APP_ROLE[s.jobRole];
      const userId = randomUUID();
      await tx.insert(t.users).values({
        id: userId, username: x.username, passwordHash: hash, displayName: s.name, role, depotId: s.depotId, outletId: s.outletId,
        driverId: s.driverId, staffId: s.id, active: true,
      });
      return userId;
    },
  );
  return c.json({ id: userId }, 201);
});

peopleRoutes.patch("/logins/:userId", async (c) => {
  const userId = c.req.param("userId");
  const x = await body(c, LoginPatch);
  const me = c.var.auth.user.userId;
  await c.var.svc.master(
    () => ({ ...who(c), action: "user.update", entity: "user", entityId: userId, summary: x.active ? "Turned sign-in access back on" : "Turned off sign-in access and signed the account out everywhere", detail: x }),
    async (tx) => {
      const [u] = await tx.select().from(t.users).where(eq(t.users.id, userId));
      need(u, "Login");
      if (x.active === false && u.active) await guardAccess(tx, me, u.id, u.role === "admin");
      if (x.active && u.staffId) {
        const [s] = await tx.select().from(t.staff).where(eq(t.staff.id, u.staffId));
        if (s?.status === "left") throw new OpError(409, `${s.name} has left Waypoint. Change their record first if they’ve come back.`);
      }
      await tx.update(t.users).set({ active: x.active, updatedAt: now() }).where(eq(t.users.id, userId));
      if (!x.active) await revokeUserSessions(tx as never, userId);
    },
  );
  return c.json({ ok: true });
});

peopleRoutes.post("/logins/:userId/password", async (c) => {
  const userId = c.req.param("userId");
  const { password } = await body(c, z.object({ password: z.string().min(1).max(200) }));
  const problem = passwordProblem(password);
  if (problem) throw new OpError(400, `Password: ${problem}`);
  const hash = await hashPassword(password);
  await c.var.svc.master(
    () => ({ ...who(c), action: "user.password", entity: "user", entityId: userId, summary: "Set a new password and signed the account out everywhere" }),
    async (tx) => {
      const r = await tx.update(t.users).set({ passwordHash: hash, updatedAt: now() }).where(eq(t.users.id, userId)).returning({ id: t.users.id });
      need(r[0], "Login");
      await tx.delete(t.sessions).where(eq(t.sessions.userId, userId));
    },
  );
  return c.json({ ok: true });
});

// ── Activity ───────────────────────────────────────────────────────────────────────────────────

peopleRoutes.get("/activity", async (c) => {
  const limit = Math.min(200, Number(c.req.query("limit") ?? 100) || 100);
  const before = Number(c.req.query("before")) || undefined;
  const q = c.req.query("q")?.trim();
  const area = c.req.query("area"); // people | access | signin
  const conds: SQL[] = [PEOPLE_LOG];
  if (before) conds.push(lt(t.auditLog.id, before));
  if (q) conds.push(or(ilike(t.auditLog.summary, `%${q}%`), ilike(t.auditLog.actor, `%${q}%`), ilike(t.auditLog.entityId, `%${q}%`))!);
  if (area === "people") conds.push(sql`(${t.auditLog.action} like 'staff.%' or ${t.auditLog.action} like 'driver.%')`);
  if (area === "access") conds.push(ilike(t.auditLog.action, "user.%"));
  if (area === "signin") conds.push(ilike(t.auditLog.action, "auth.%"));
  const rows = await c.var.svc.db.select().from(t.auditLog).where(and(...conds)).orderBy(desc(t.auditLog.id)).limit(limit);
  return c.json(rows.map(activityRow));
});
