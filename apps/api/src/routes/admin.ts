// Admin console endpoints: master data (depots, branches, vehicles, drivers, products), user accounts,
// read-only operations, the activity log and the demo reset. Admin role only; every write is audited.
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { and, count, desc, eq, ilike, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { ActivityRow, DepotRow, DriverRow, Lookups, OrderRow, OutletRow, Overview, ProductRow, UserRow, VehicleRow } from "@waypoint/core/admin";
import { outletLatLng } from "@waypoint/core/domain/geo";
import { fmtMin } from "@waypoint/core/domain/time";
import type { Depot, Role } from "@waypoint/core/domain/types";
import { initialDb, OpError } from "@waypoint/core/ops";
import { DEMO_DATE, depotName, net, outletName } from "@waypoint/core/reference";
import { orderState } from "@waypoint/core/views";
import * as t from "../db/schema.ts";
import { dataset } from "../db/seed.ts";
import { hashPassword, passwordProblem, revokeUserSessions } from "../auth.ts";
import { body, requireAuth, type Env } from "../http.ts";
import { emptyOps, iso, persist } from "../store.ts";
import type { AuditEntry } from "../service.ts";
import type { Tx } from "../db/client.ts";

const DepotId = z.enum(["Peliyagoda", "Kandy"]);
const Hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM");
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const opt = <T extends z.ZodType>(s: T) => s.nullable().optional();
const text = (max = 120) => z.string().trim().min(1).max(max);
const now = () => new Date().toISOString();

const Outlet = z.object({
  name: text(80),
  brand: z.enum(["Fresh", "Style", "Tech"]),
  district: text(40),
  depotId: DepotId,
  dockType: z.enum(["rear_dock", "street", "mall_bay"]),
  parking: z.enum(["normal", "van_only", "mall_dock"]),
  mallWindow: opt(z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/, "use HH:MM-HH:MM")),
  windowOpen: Hhmm,
  windowClose: Hhmm,
  lat: opt(z.number().min(5.5).max(10)),
  lng: opt(z.number().min(79).max(82.5)),
  phone: opt(z.string().max(30)),
  active: z.boolean().optional(),
});
const Vehicle = z.object({
  plateNo: opt(z.string().max(20)),
  type: z.enum(["truck", "van"]),
  temp: z.enum(["reefer", "ambient"]),
  weightCapKg: z.number().positive().max(40000),
  volumeCapM3: z.number().positive().max(120),
  fuelType: text(20),
  kmPerL: z.number().positive().max(40),
  weeklyFuelQuotaL: z.number().positive().max(5000),
  depotId: DepotId,
  status: z.enum(["available", "in_workshop"]),
  active: z.boolean().optional(),
});
const Driver = z.object({
  name: text(80),
  phone: opt(z.string().max(30)),
  licenseNo: opt(z.string().max(30)),
  licenseClass: opt(z.string().max(10)),
  licenseExpiry: opt(Day),
  depotId: DepotId,
  vehicleId: opt(z.string().max(20)),
  status: z.enum(["active", "on_leave", "inactive"]),
  hiredOn: opt(Day),
});
const Product = z.object({
  name: text(80),
  unit: text(40),
  brand: z.enum(["Fresh", "Style", "Tech"]),
  temp: z.enum(["chilled", "ambient"]),
  weightKg: z.number().positive().max(2000),
  volumeM3: z.number().positive().max(20),
  active: z.boolean().optional(),
});
const User = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,32}$/, "3–32 letters, digits, dots, dashes or underscores"),
  displayName: text(80),
  role: z.enum(["admin", "dispatcher", "loader", "driver", "store"]),
  depotId: opt(DepotId),
  outletId: opt(z.string().max(20)),
  outletScope: opt(z.enum(["outlet", "depot"])),
  driverId: opt(z.string().max(20)),
  active: z.boolean().optional(),
});
const Depot = z.object({ name: text(60), address: opt(z.string().max(160)), phone: opt(z.string().max(30)), lat: z.number().min(5.5).max(10), lng: z.number().min(79).max(82.5) });

/** Next free id with a prefix: OUT061, DRV039, VEH039… */
async function nextId(tx: Tx, table: typeof t.outlets | typeof t.drivers | typeof t.vehicles, prefix: string) {
  const rows = await tx.select({ id: table.id }).from(table);
  const max = Math.max(0, ...rows.map((r) => Number(r.id.replace(/\D/g, "")) || 0));
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

function need<T>(v: T | undefined | null, what: string): T {
  if (v == null) throw new OpError(404, `${what} not found.`);
  return v;
}

export const adminRoutes = new Hono<Env>().use(requireAuth("admin"));

const who = (c: { var: Env["Variables"] }): Pick<AuditEntry, "userId" | "actor" | "role"> => ({ userId: c.var.auth.user.userId, actor: c.var.auth.user.name, role: "admin" });

// ── Overview & lookups ────────────────────────────────────────────────────────────────────────

adminRoutes.get("/overview", async (c) => {
  const { db } = c.var.svc;
  const ops = c.var.svc.ops;
  const [outlets, vehicles, drivers, users, products, activity] = await Promise.all([
    db.select({ active: t.outlets.active }).from(t.outlets),
    db.select({ id: t.vehicles.id, status: t.vehicles.status, active: t.vehicles.active }).from(t.vehicles),
    db.select().from(t.drivers),
    db.select({ role: t.users.role, active: t.users.active, driverId: t.users.driverId }).from(t.users),
    db.select({ active: t.products.active }).from(t.products),
    db.select().from(t.auditLog).orderBy(desc(t.auditLog.id)).limit(12),
  ]);
  const byRole = { admin: 0, dispatcher: 0, loader: 0, driver: 0, store: 0 } as Record<Role, number>;
  for (const u of users) if (u.active) byRole[u.role]++;

  const today = (["Peliyagoda", "Kandy"] as Depot[]).map((depot) => {
    const plan = ops.plans[depot];
    const stops = plan?.status === "published" ? plan.trips.flatMap((x) => x.orderIds) : [];
    return {
      depot, name: depotName(depot), ordersClosed: ops.day[depot].ordersClosed,
      orders: ops.orders.filter((o) => o.depot === depot && o.forDate === DEMO_DATE).length,
      plan: plan ? { version: plan.version, status: plan.status, trips: plan.trips.length, deferred: plan.deferred.length } : null,
      stops: stops.length,
      delivered: stops.filter((id) => ops.stops[id]?.deliveredAt).length,
      failed: stops.filter((id) => ops.stops[id]?.problem).length,
      openExceptions: ops.exceptions.filter((e) => e.depot === depot && !e.resolved).length,
    };
  });

  // Licence renewals are checked against the real calendar, not the demo day.
  const soon = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);
  const expiring = drivers.filter((d) => d.status !== "inactive" && d.licenseExpiry && d.licenseExpiry <= soon);
  const unassigned = drivers.filter((d) => d.status === "active" && !d.vehicleId);
  const loggedIn = new Set(users.map((u) => u.driverId).filter(Boolean));
  const withoutLogin = drivers.filter((d) => d.status === "active" && !loggedIn.has(d.id));
  const workshop = vehicles.filter((v) => v.active && v.status === "in_workshop");
  const alerts: Overview["alerts"] = [];
  if (expiring.length) alerts.push({ level: "danger", title: `${expiring.length} driving licence${expiring.length > 1 ? "s" : ""} due for renewal`, body: expiring.slice(0, 4).map((d) => `${d.name} (${d.licenseExpiry})`).join(" · "), href: "/drivers?filter=licence" });
  if (workshop.length) alerts.push({ level: "warning", title: `${workshop.length} vehicles in the workshop`, body: workshop.slice(0, 8).map((v) => v.id).join(" · "), href: "/vehicles?filter=workshop" });
  if (unassigned.length) alerts.push({ level: "warning", title: `${unassigned.length} active driver${unassigned.length > 1 ? "s" : ""} without a vehicle`, body: unassigned.slice(0, 4).map((d) => d.name).join(" · "), href: "/drivers?filter=unassigned" });
  if (withoutLogin.length) alerts.push({ level: "info", title: `${withoutLogin.length} active drivers have no login yet`, body: "Create accounts so they can use the driver app on their phones.", href: "/drivers?filter=nologin" });

  return c.json({
    demoDate: DEMO_DATE,
    counts: {
      outlets: { active: outlets.filter((o) => o.active).length, total: outlets.length },
      vehicles: { available: vehicles.filter((v) => v.active && v.status === "available").length, workshop: workshop.length, inactive: vehicles.filter((v) => !v.active).length, total: vehicles.length },
      drivers: { active: drivers.filter((d) => d.status === "active").length, onLeave: drivers.filter((d) => d.status === "on_leave").length, total: drivers.length },
      users: { active: users.filter((u) => u.active).length, total: users.length, byRole },
      products: { active: products.filter((p) => p.active).length, total: products.length },
    },
    today,
    alerts,
    activity: activity.map(activityRow),
  } satisfies Overview);
});

adminRoutes.get("/lookups", async (c) => {
  const { db } = c.var.svc;
  const [depots, travel, vehicles, outlets, drivers, users] = await Promise.all([
    db.select().from(t.depots),
    db.select({ depot: t.districtTravel.depotId, district: t.districtTravel.district }).from(t.districtTravel),
    db.select().from(t.vehicles),
    db.select().from(t.outlets),
    db.select().from(t.drivers),
    db.select({ driverId: t.users.driverId }).from(t.users),
  ]);
  const withLogin = new Set(users.map((u) => u.driverId));
  return c.json({
    depots: depots.map((d) => ({ id: d.id as Depot, name: d.name })),
    districts: travel.map((d) => ({ depot: d.depot as Depot, district: d.district })).sort((a, b) => a.district.localeCompare(b.district)),
    vehicles: vehicles.map((v) => ({ id: v.id, depot: v.depotId as Depot, label: `${v.id} · ${v.temp === "reefer" ? "reefer" : "dry"} ${v.type}${v.plateNo ? ` · ${v.plateNo}` : ""}`, active: v.active })),
    outlets: outlets.map((o) => ({ id: o.id, depot: o.depotId as Depot, label: `${o.id} · ${o.brand} ${o.name}`, active: o.active })),
    drivers: drivers.map((d) => ({ id: d.id, depot: d.depotId as Depot, label: `${d.name} · ${d.vehicleId ?? "no vehicle"}`, hasLogin: withLogin.has(d.id) })),
  } satisfies Lookups);
});

// ── Depots ─────────────────────────────────────────────────────────────────────────────────────

adminRoutes.get("/depots", async (c) => {
  const { db } = c.var.svc;
  const [depots, outlets, vehicles, drivers] = await Promise.all([
    db.select().from(t.depots),
    db.select({ d: t.outlets.depotId, n: count() }).from(t.outlets).groupBy(t.outlets.depotId),
    db.select({ d: t.vehicles.depotId, n: count() }).from(t.vehicles).groupBy(t.vehicles.depotId),
    db.select({ d: t.drivers.depotId, n: count() }).from(t.drivers).groupBy(t.drivers.depotId),
  ]);
  const n = (rows: { d: string; n: number }[], id: string) => Number(rows.find((r) => r.d === id)?.n ?? 0);
  return c.json(depots.map((d): DepotRow => ({ ...d, id: d.id as Depot, outlets: n(outlets, d.id), vehicles: n(vehicles, d.id), drivers: n(drivers, d.id) })));
});

adminRoutes.patch("/depots/:id", async (c) => {
  const id = c.req.param("id");
  const x = await body(c, Depot);
  await c.var.svc.master(
    () => ({ ...who(c), action: "depot.update", entity: "depot", entityId: id, summary: `Updated depot ${x.name}`, detail: x }),
    async (tx) => {
      const r = await tx.update(t.depots).set({ ...x, updatedAt: now() }).where(eq(t.depots.id, id)).returning({ id: t.depots.id });
      need(r[0], "Depot");
    },
  );
  return c.json({ ok: true });
});

// ── Outlets (branches) ─────────────────────────────────────────────────────────────────────────

adminRoutes.get("/outlets", async (c) => {
  const { db } = c.var.svc;
  const [outlets, managers] = await Promise.all([
    db.select().from(t.outlets).orderBy(t.outlets.id),
    db.select({ outletId: t.users.outletId, name: t.users.displayName }).from(t.users).where(and(eq(t.users.role, "store"), eq(t.users.active, true))),
  ]);
  const orders = c.var.svc.ops.orders.filter((o) => o.forDate === DEMO_DATE);
  return c.json(outlets.map((o): OutletRow => ({
    ...o, depotId: o.depotId as Depot, brand: o.brand as OutletRow["brand"], dockType: o.dockType as OutletRow["dockType"], parking: o.parking as OutletRow["parking"],
    managers: managers.filter((m) => m.outletId === o.id).map((m) => m.name),
    ordersToday: orders.filter((x) => x.outletId === o.id).length,
  })));
});

async function checkDistrict(tx: Tx, depot: string, district: string) {
  const [r] = await tx.select().from(t.districtTravel).where(and(eq(t.districtTravel.depotId, depot), eq(t.districtTravel.district, district)));
  if (!r) throw new OpError(400, `${depotName(depot)} doesn’t deliver to ${district}. Choose a district it serves.`);
}
const withCoords = (id: string, x: z.infer<typeof Outlet>) => {
  if (x.lat != null && x.lng != null) return { lat: x.lat, lng: x.lng };
  const [lat, lng] = outletLatLng({ id, district: x.district, depot: x.depotId } as never, x.name);
  return { lat, lng };
};

adminRoutes.post("/outlets", async (c) => {
  const x = await body(c, Outlet);
  const id = await c.var.svc.master<string>(
    (id: string) => ({ ...who(c), action: "outlet.create", entity: "outlet", entityId: id, summary: `Added branch ${id} ${x.name} (${x.brand}, ${x.district})` }),
    async (tx) => {
      await checkDistrict(tx, x.depotId, x.district);
      const id = await nextId(tx, t.outlets, "OUT");
      await tx.insert(t.outlets).values({ ...x, id, ...withCoords(id, x), mallWindow: x.parking === "mall_dock" ? (x.mallWindow ?? null) : null, active: x.active ?? true });
      return id;
    },
  );
  return c.json({ id }, 201);
});

adminRoutes.patch("/outlets/:id", async (c) => {
  const id = c.req.param("id");
  const x = await body(c, Outlet);
  await c.var.svc.master(
    () => ({ ...who(c), action: "outlet.update", entity: "outlet", entityId: id, summary: `Updated branch ${id} ${x.name}${x.active === false ? " (closed)" : ""}`, detail: x }),
    async (tx) => {
      await checkDistrict(tx, x.depotId, x.district);
      const [cur] = await tx.select().from(t.outlets).where(eq(t.outlets.id, id));
      need(cur, "Branch");
      if (cur.depotId !== x.depotId && c.var.svc.ops.orders.some((o) => o.outletId === id && o.forDate === DEMO_DATE))
        throw new OpError(409, `${id} has orders in today’s plan. Move it to another depot after today’s run.`);
      await tx.update(t.outlets).set({ ...x, ...withCoords(id, x), mallWindow: x.parking === "mall_dock" ? (x.mallWindow ?? null) : null, updatedAt: now() }).where(eq(t.outlets.id, id));
    },
  );
  return c.json({ ok: true });
});

// ── Vehicles ───────────────────────────────────────────────────────────────────────────────────

const tripsToday = (c: { var: Env["Variables"] }, vehicleId: string) =>
  Object.values(c.var.svc.ops.plans).flatMap((p) => p?.trips ?? []).filter((x) => x.vehicleId === vehicleId).length;

adminRoutes.get("/vehicles", async (c) => {
  const { db } = c.var.svc;
  const [vehicles, drivers] = await Promise.all([db.select().from(t.vehicles).orderBy(t.vehicles.id), db.select({ id: t.drivers.id, name: t.drivers.name, vehicleId: t.drivers.vehicleId }).from(t.drivers)]);
  return c.json(vehicles.map((v): VehicleRow => ({
    ...v, depotId: v.depotId as Depot, type: v.type as VehicleRow["type"], temp: v.temp as VehicleRow["temp"],
    drivers: drivers.filter((d) => d.vehicleId === v.id).map((d) => ({ id: d.id, name: d.name })),
    tripsToday: tripsToday(c, v.id),
  })));
});

adminRoutes.post("/vehicles", async (c) => {
  const x = await body(c, Vehicle);
  const svc = c.var.svc;
  const [{ max }] = await svc.db.select({ max: sql<string>`coalesce(max(${t.vehicles.id}), 'VEH000')` }).from(t.vehicles);
  const id = `VEH${String(Number(max.replace(/\D/g, "")) + 1).padStart(3, "0")}`;
  await svc.change(
    () => ({ ...who(c), action: "vehicle.create", entity: "vehicle", entityId: id, summary: `Added ${x.temp === "reefer" ? "refrigerated" : "dry-box"} ${x.type} ${id} at ${depotName(x.depotId)}` }),
    (next) => {
      next.fleetStatus[id] = x.status;
    },
    { before: async (tx) => void (await tx.insert(t.vehicles).values({ ...x, id, active: x.active ?? true })), reference: true },
  );
  return c.json({ id }, 201);
});

adminRoutes.patch("/vehicles/:id", async (c) => {
  const id = c.req.param("id");
  const x = await body(c, Vehicle);
  const svc = c.var.svc;
  const [cur] = await svc.db.select().from(t.vehicles).where(eq(t.vehicles.id, id));
  need(cur, "Vehicle");
  const trips = tripsToday(c, id);
  if (trips && (x.active === false || x.status === "in_workshop" || x.depotId !== cur.depotId || x.temp !== cur.temp || x.type !== cur.type))
    throw new OpError(409, `${id} has ${trips} trip${trips > 1 ? "s" : ""} in today’s plan. Move them in Plan & allocate first, then change the vehicle.`);
  await svc.change(
    () => ({ ...who(c), action: "vehicle.update", entity: "vehicle", entityId: id, summary: `Updated ${id}${x.active === false ? " (retired)" : x.status !== cur.status ? ` (${x.status === "available" ? "back in service" : "to the workshop"})` : ""}`, detail: x }),
    (next) => {
      next.fleetStatus[id] = x.status;
    },
    {
      before: async (tx) => {
        const { status: _s, ...rest } = x;
        void _s;
        await tx.update(t.vehicles).set({ ...rest, updatedAt: now() }).where(eq(t.vehicles.id, id));
      },
      reference: true,
    },
  );
  return c.json({ ok: true });
});

// ── Drivers ────────────────────────────────────────────────────────────────────────────────────

adminRoutes.get("/drivers", async (c) => {
  const { db } = c.var.svc;
  const [drivers, users] = await Promise.all([
    db.select().from(t.drivers).orderBy(t.drivers.id),
    db.select({ id: t.users.id, username: t.users.username, active: t.users.active, driverId: t.users.driverId }).from(t.users).where(eq(t.users.role, "driver")),
  ]);
  const ops = c.var.svc.ops;
  return c.json(drivers.map((d): DriverRow => {
    const u = users.find((x) => x.driverId === d.id);
    return {
      ...d, depotId: d.depotId as Depot,
      login: u ? { userId: u.id, username: u.username, active: u.active } : null,
      deliveredToday: d.vehicleId ? Object.values(ops.stops).filter((s) => s.vehicleId === d.vehicleId && s.deliveredAt).length : 0,
    };
  }));
});

async function checkVehicle(tx: Tx, vehicleId: string | null | undefined, depot: string) {
  if (!vehicleId) return;
  const [v] = await tx.select().from(t.vehicles).where(eq(t.vehicles.id, vehicleId));
  if (!v) throw new OpError(400, `Vehicle ${vehicleId} doesn’t exist.`);
  if (v.depotId !== depot) throw new OpError(400, `${vehicleId} is based at ${depotName(v.depotId)}. Assign a vehicle from the driver’s depot.`);
  if (!v.active) throw new OpError(400, `${vehicleId} is retired.`);
}

adminRoutes.post("/drivers", async (c) => {
  const x = await body(c, Driver);
  const id = await c.var.svc.master<string>(
    (id: string) => ({ ...who(c), action: "driver.create", entity: "driver", entityId: id, summary: `Added driver ${x.name} (${id})${x.vehicleId ? ` on ${x.vehicleId}` : ""}` }),
    async (tx) => {
      await checkVehicle(tx, x.vehicleId, x.depotId);
      const id = await nextId(tx, t.drivers, "DRV");
      await tx.insert(t.drivers).values({ ...x, id, vehicleId: x.vehicleId || null });
      return id;
    },
  );
  return c.json({ id }, 201);
});

adminRoutes.patch("/drivers/:id", async (c) => {
  const id = c.req.param("id");
  const x = await body(c, Driver);
  await c.var.svc.master(
    () => ({ ...who(c), action: "driver.update", entity: "driver", entityId: id, summary: `Updated driver ${x.name} (${id})${x.vehicleId ? ` · ${x.vehicleId}` : " · no vehicle"} · ${x.status.replace("_", " ")}`, detail: x }),
    async (tx) => {
      await checkVehicle(tx, x.vehicleId, x.depotId);
      const r = await tx.update(t.drivers).set({ ...x, vehicleId: x.vehicleId || null, updatedAt: now() }).where(eq(t.drivers.id, id)).returning({ id: t.drivers.id });
      need(r[0], "Driver");
      // A driver who leaves can't keep signing in.
      if (x.status === "inactive") {
        const [u] = await tx.select().from(t.users).where(eq(t.users.driverId, id));
        if (u) {
          await tx.update(t.users).set({ active: false, updatedAt: now() }).where(eq(t.users.id, u.id));
          await tx.delete(t.sessions).where(eq(t.sessions.userId, u.id));
        }
      }
    },
  );
  return c.json({ ok: true });
});

// ── Products ───────────────────────────────────────────────────────────────────────────────────

adminRoutes.get("/products", async (c) => {
  const rows = await c.var.svc.db.select().from(t.products).orderBy(t.products.brand, t.products.id);
  return c.json(rows.map((p): ProductRow => ({ ...p, brand: p.brand as ProductRow["brand"], temp: p.temp as ProductRow["temp"] })));
});

const ProductNew = Product.extend({ id: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,16}$/, "2–16 capitals, digits or dashes") });

adminRoutes.post("/products", async (c) => {
  const x = await body(c, ProductNew);
  if (x.brand !== "Fresh" && x.temp === "chilled") throw new OpError(400, "Only Fresh products can be chilled.");
  await c.var.svc.master(
    () => ({ ...who(c), action: "product.create", entity: "product", entityId: x.id, summary: `Added product ${x.id} ${x.name}` }),
    async (tx) => void (await tx.insert(t.products).values({ ...x, active: x.active ?? true })),
  );
  return c.json({ id: x.id }, 201);
});

adminRoutes.patch("/products/:id", async (c) => {
  const id = c.req.param("id");
  const x = await body(c, Product);
  if (x.brand !== "Fresh" && x.temp === "chilled") throw new OpError(400, "Only Fresh products can be chilled.");
  await c.var.svc.master(
    () => ({ ...who(c), action: "product.update", entity: "product", entityId: id, summary: `Updated product ${id} ${x.name}${x.active === false ? " (withdrawn)" : ""}`, detail: x }),
    async (tx) => {
      const r = await tx.update(t.products).set({ ...x, updatedAt: now() }).where(eq(t.products.id, id)).returning({ id: t.products.id });
      need(r[0], "Product");
    },
  );
  return c.json({ ok: true });
});

// ── Users (logins) ─────────────────────────────────────────────────────────────────────────────

adminRoutes.get("/users", async (c) => {
  const { db } = c.var.svc;
  const [users, drivers, sessions] = await Promise.all([
    db.select().from(t.users).orderBy(t.users.role, t.users.username),
    db.select({ id: t.drivers.id, name: t.drivers.name, vehicleId: t.drivers.vehicleId }).from(t.drivers),
    db.select({ userId: t.sessions.userId, n: count() }).from(t.sessions).where(sql`${t.sessions.expiresAt} > now()`).groupBy(t.sessions.userId),
  ]);
  return c.json(users.map((u): UserRow => {
    const d = drivers.find((x) => x.id === u.driverId);
    const linkedTo =
      u.role === "driver" ? (d ? `${d.id} · ${d.vehicleId ?? "no vehicle"}` : "No driver record")
      : u.role === "store" ? `${u.outletId} ${outletName(u.outletId ?? "")}${u.outletScope === "depot" ? ` · all ${depotName(u.depotId ?? "")} outlets` : ""}`
      : u.role === "admin" ? "All depots" : depotName(u.depotId ?? "");
    return {
      id: u.id, username: u.username, displayName: u.displayName, role: u.role, depotId: u.depotId as Depot | null, outletId: u.outletId,
      outletScope: u.outletScope as UserRow["outletScope"], driverId: u.driverId, linkedTo, active: u.active,
      lastLoginAt: iso(u.lastLoginAt) ?? null, createdAt: iso(u.createdAt)!, sessions: Number(sessions.find((s) => s.userId === u.id)?.n ?? 0),
    };
  }));
});

/** Fills the depot from what the account is attached to, and refuses combinations that can't work. */
async function shapeUser(tx: Tx, x: z.infer<typeof User>) {
  const out = { ...x, depotId: x.depotId ?? null, outletId: null as string | null, outletScope: null as string | null, driverId: null as string | null };
  if (x.role === "driver") {
    if (!x.driverId) throw new OpError(400, "Choose the driver record this login belongs to.");
    const [d] = await tx.select().from(t.drivers).where(eq(t.drivers.id, x.driverId));
    if (!d) throw new OpError(400, `Driver ${x.driverId} doesn’t exist.`);
    Object.assign(out, { driverId: d.id, depotId: d.depotId });
  } else if (x.role === "store") {
    if (!x.outletId) throw new OpError(400, "Choose the branch this store manager runs.");
    const o = net.outlets.get(x.outletId);
    if (!o) throw new OpError(400, `Branch ${x.outletId} doesn’t exist.`);
    Object.assign(out, { outletId: o.id, depotId: o.depot, outletScope: x.outletScope ?? "outlet" });
  } else if (!out.depotId) {
    throw new OpError(400, "Choose the depot this account works at.");
  }
  return out;
}

const NewUser = User.extend({ password: z.string().min(1).max(200) });

adminRoutes.post("/users", async (c) => {
  const x = await body(c, NewUser);
  const problem = passwordProblem(x.password);
  if (problem) throw new OpError(400, `Password: ${problem}`);
  const hash = await hashPassword(x.password);
  const id = await c.var.svc.master<string>(
    (id: string) => ({ ...who(c), action: "user.create", entity: "user", entityId: id, summary: `Created ${x.role} login “${x.username}” for ${x.displayName}` }),
    async (tx) => {
      const { password: _p, ...rest } = x;
      void _p;
      const shaped = await shapeUser(tx, rest);
      const id = randomUUID();
      await tx.insert(t.users).values({ ...shaped, id, passwordHash: hash, active: x.active ?? true });
      return id;
    },
  );
  return c.json({ id }, 201);
});

adminRoutes.patch("/users/:id", async (c) => {
  const id = c.req.param("id");
  const x = await body(c, User);
  const me = c.var.auth.user;
  await c.var.svc.master(
    () => ({ ...who(c), action: "user.update", entity: "user", entityId: id, summary: `Updated login “${x.username}” (${x.role}${x.active === false ? ", disabled" : ""})`, detail: { ...x } }),
    async (tx) => {
      const [cur] = await tx.select().from(t.users).where(eq(t.users.id, id));
      need(cur, "Account");
      if (id === me.userId && (x.active === false || x.role !== "admin")) throw new OpError(409, "You can’t disable or demote your own account.");
      if (cur.role === "admin" && (x.active === false || x.role !== "admin")) {
        const [{ n }] = await tx.select({ n: count() }).from(t.users).where(and(eq(t.users.role, "admin"), eq(t.users.active, true), ne(t.users.id, id)));
        if (!Number(n)) throw new OpError(409, "Keep at least one active administrator.");
      }
      const shaped = await shapeUser(tx, x);
      await tx.update(t.users).set({ ...shaped, updatedAt: now() }).where(eq(t.users.id, id));
      // Role, attachment or access changed: make them sign in again with the new rights.
      if (x.active === false || x.role !== cur.role || shaped.depotId !== cur.depotId || shaped.outletId !== cur.outletId || shaped.driverId !== cur.driverId) await revokeUserSessions(tx as never, id);
    },
  );
  return c.json({ ok: true });
});

adminRoutes.post("/users/:id/password", async (c) => {
  const id = c.req.param("id");
  const { password } = await body(c, z.object({ password: z.string().min(1).max(200) }));
  const problem = passwordProblem(password);
  if (problem) throw new OpError(400, `Password: ${problem}`);
  const hash = await hashPassword(password);
  await c.var.svc.master(
    () => ({ ...who(c), action: "user.password", entity: "user", entityId: id, summary: "Set a new password and signed the account out everywhere" }),
    async (tx) => {
      const r = await tx.update(t.users).set({ passwordHash: hash, updatedAt: now() }).where(eq(t.users.id, id)).returning({ id: t.users.id });
      need(r[0], "Account");
      await tx.delete(t.sessions).where(eq(t.sessions.userId, id));
    },
  );
  return c.json({ ok: true });
});

// ── Operations (read-only) ────────────────────────────────────────────────────────────────────

adminRoutes.get("/orders", (c) => {
  const db = c.var.svc.ops;
  const rows = db.orders
    .filter((o) => o.forDate === DEMO_DATE || o.forDate === "next-run")
    .map((o): OrderRow => {
      const s = orderState(db, o.id);
      const stop = db.stops[o.id];
      return {
        id: o.id, outletId: o.outletId, outletName: outletName(o.outletId), depot: o.depot, brand: o.brand, temp: o.temp, units: o.units, volumeM3: o.volumeM3,
        status: s.status, vehicleId: s.tripEval?.vehicle.id ?? null, eta: s.eta != null ? fmtMin(s.eta) : null, deliveredAt: stop?.deliveredAt ?? null,
        source: o.source, createdBy: o.createdBy ?? null, forDate: o.forDate ?? null,
      };
    });
  return c.json(rows);
});

function activityRow(a: typeof t.auditLog.$inferSelect): ActivityRow {
  return { id: a.id, at: iso(a.at)!, actor: a.actor, role: a.role, action: a.action, entity: a.entity, entityId: a.entityId, summary: a.summary };
}

adminRoutes.get("/activity", async (c) => {
  const limit = Math.min(200, Number(c.req.query("limit") ?? 100) || 100);
  const before = Number(c.req.query("before")) || undefined;
  const q = c.req.query("q")?.trim();
  const area = c.req.query("area"); // ops | admin | auth
  const conds: SQL[] = [];
  if (before) conds.push(lt(t.auditLog.id, before));
  if (q) conds.push(or(ilike(t.auditLog.summary, `%${q}%`), ilike(t.auditLog.actor, `%${q}%`), ilike(t.auditLog.entityId, `%${q}%`))!);
  if (area === "ops") conds.push(ilike(t.auditLog.action, "ops.%"));
  if (area === "auth") conds.push(ilike(t.auditLog.action, "auth.%"));
  if (area === "admin") conds.push(sql`${t.auditLog.action} not like 'ops.%' and ${t.auditLog.action} not like 'auth.%'`);
  const rows = await c.var.svc.db.select().from(t.auditLog).where(conds.length ? and(...conds) : undefined).orderBy(desc(t.auditLog.id)).limit(limit);
  return c.json(rows.map(activityRow));
});

// ── Demo reset ─────────────────────────────────────────────────────────────────────────────────

adminRoutes.post("/reset", async (c) => {
  const svc = c.var.svc;
  await svc.replaceAll({ ...who(c), action: "ops.reset", summary: `Reset operations to the start of ${DEMO_DATE}` }, async (tx) => {
    await tx.execute(t.tableOrderForReset);
    const start = initialDb(dataset);
    for (const [vehicleId, status] of Object.entries(start.fleetStatus)) await tx.update(t.vehicles).set({ status }).where(eq(t.vehicles.id, vehicleId));
    await persist(tx, emptyOps(start.fleetStatus), start);
  });
  return c.json({ ok: true });
});
