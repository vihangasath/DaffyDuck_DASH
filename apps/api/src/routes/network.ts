// Network records for dispatchers (operations app): depots, branches, vehicles (and which driver runs each),
// products, and the demo-day reset. People (staff, licences, logins) live in routes/people.ts for HR.
// Dispatcher role only; every write is audited.
import { Hono } from "hono";
import { and, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DepotRow, NetworkLookups, OutletRow, ProductRow, VehicleRow } from "@waypoint/core/records";
import { outletLatLng } from "@waypoint/core/domain/geo";
import type { Depot } from "@waypoint/core/domain/types";
import { initialDb, OpError } from "@waypoint/core/ops";
import { DEMO_DATE, depotName } from "@waypoint/core/reference";
import * as t from "../db/schema.ts";
import { dataset } from "../db/seed.ts";
import { body, requireAuth, type Env } from "../http.ts";
import { emptyOps, persist } from "../store.ts";
import type { AuditEntry } from "../service.ts";
import type { Tx } from "../db/client.ts";

const DepotId = z.enum(["Peliyagoda", "Kandy"]);
const Hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM");
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
  /** The driver who runs this vehicle (dispatch assigns; HR keeps the person's record). */
  driverId: opt(z.string().max(20)),
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
const Depot = z.object({ name: text(60), address: opt(z.string().max(160)), phone: opt(z.string().max(30)), lat: z.number().min(5.5).max(10), lng: z.number().min(79).max(82.5) });

/** Next free id with a prefix: OUT061, DRV039, VEH039… */
async function nextId(tx: Tx, table: typeof t.outlets | typeof t.vehicles, prefix: string) {
  const rows = await tx.select({ id: table.id }).from(table);
  const max = Math.max(0, ...rows.map((r) => Number(r.id.replace(/\D/g, "")) || 0));
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

function need<T>(v: T | undefined | null, what: string): T {
  if (v == null) throw new OpError(404, `${what} not found.`);
  return v;
}

export const networkRoutes = new Hono<Env>().use(requireAuth("dispatcher"));

const who = (c: { var: Env["Variables"] }): Pick<AuditEntry, "userId" | "actor" | "role"> => ({ userId: c.var.auth.user.userId, actor: c.var.auth.user.name, role: "dispatcher" });

networkRoutes.get("/lookups", async (c) => {
  const { db } = c.var.svc;
  const [depots, travel, drivers] = await Promise.all([
    db.select().from(t.depots),
    db.select({ depot: t.districtTravel.depotId, district: t.districtTravel.district }).from(t.districtTravel),
    db.select().from(t.drivers).orderBy(t.drivers.name),
  ]);
  return c.json({
    depots: depots.map((d) => ({ id: d.id as Depot, name: d.name })),
    districts: travel.map((d) => ({ depot: d.depot as Depot, district: d.district })).sort((a, b) => a.district.localeCompare(b.district)),
    drivers: drivers
      .filter((d) => d.status !== "inactive")
      .map((d) => ({ id: d.id, depot: d.depotId as Depot, name: d.name, vehicleId: d.vehicleId, onLeave: d.status === "on_leave" })),
  } satisfies NetworkLookups);
});

// ── Depots ─────────────────────────────────────────────────────────────────────────────────────

networkRoutes.get("/depots", async (c) => {
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

networkRoutes.patch("/depots/:id", async (c) => {
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

networkRoutes.get("/outlets", async (c) => {
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

networkRoutes.post("/outlets", async (c) => {
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

networkRoutes.patch("/outlets/:id", async (c) => {
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

/** Puts `driverId` on the vehicle (and takes it off anyone else). `undefined` leaves the assignment alone; null clears it. */
async function assignDriver(tx: Tx, vehicleId: string, depot: string, driverId: string | null | undefined) {
  if (driverId === undefined) return;
  if (driverId) {
    const [d] = await tx.select().from(t.drivers).where(eq(t.drivers.id, driverId));
    if (!d) throw new OpError(400, `Driver ${driverId} doesn’t exist.`);
    if (d.depotId !== depot) throw new OpError(400, `${d.name} works from ${depotName(d.depotId)}. Choose a driver from this vehicle’s depot.`);
    if (d.status === "inactive") throw new OpError(400, `${d.name} has left Waypoint.`);
  }
  await tx.update(t.drivers).set({ vehicleId: null, updatedAt: now() }).where(and(eq(t.drivers.vehicleId, vehicleId), driverId ? sql`${t.drivers.id} <> ${driverId}` : undefined));
  if (driverId) await tx.update(t.drivers).set({ vehicleId, updatedAt: now() }).where(eq(t.drivers.id, driverId));
}

networkRoutes.get("/vehicles", async (c) => {
  const { db } = c.var.svc;
  const [vehicles, drivers] = await Promise.all([db.select().from(t.vehicles).orderBy(t.vehicles.id), db.select({ id: t.drivers.id, name: t.drivers.name, vehicleId: t.drivers.vehicleId }).from(t.drivers)]);
  return c.json(vehicles.map((v): VehicleRow => ({
    ...v, depotId: v.depotId as Depot, type: v.type as VehicleRow["type"], temp: v.temp as VehicleRow["temp"],
    drivers: drivers.filter((d) => d.vehicleId === v.id).map((d) => ({ id: d.id, name: d.name })),
    tripsToday: tripsToday(c, v.id),
  })));
});

networkRoutes.post("/vehicles", async (c) => {
  const x = await body(c, Vehicle);
  const svc = c.var.svc;
  const [{ max }] = await svc.db.select({ max: sql<string>`coalesce(max(${t.vehicles.id}), 'VEH000')` }).from(t.vehicles);
  const id = `VEH${String(Number(max.replace(/\D/g, "")) + 1).padStart(3, "0")}`;
  await svc.change(
    () => ({ ...who(c), action: "vehicle.create", entity: "vehicle", entityId: id, summary: `Added ${x.temp === "reefer" ? "refrigerated" : "dry-box"} ${x.type} ${id} at ${depotName(x.depotId)}` }),
    (next) => {
      next.fleetStatus[id] = x.status;
    },
    {
      before: async (tx) => {
        const { driverId, ...row } = x;
        await tx.insert(t.vehicles).values({ ...row, id, active: x.active ?? true });
        await assignDriver(tx, id, x.depotId, driverId);
      },
      reference: true,
    },
  );
  return c.json({ id }, 201);
});

networkRoutes.patch("/vehicles/:id", async (c) => {
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
        const { status: _s, driverId, ...rest } = x;
        void _s;
        await tx.update(t.vehicles).set({ ...rest, updatedAt: now() }).where(eq(t.vehicles.id, id));
        await assignDriver(tx, id, x.depotId, x.active === false ? null : driverId);
      },
      reference: true,
    },
  );
  return c.json({ ok: true });
});

// ── Products ───────────────────────────────────────────────────────────────────────────────────

networkRoutes.get("/products", async (c) => {
  const rows = await c.var.svc.db.select().from(t.products).orderBy(t.products.brand, t.products.id);
  return c.json(rows.map((p): ProductRow => ({ ...p, brand: p.brand as ProductRow["brand"], temp: p.temp as ProductRow["temp"] })));
});

const ProductNew = Product.extend({ id: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,16}$/, "2–16 capitals, digits or dashes") });

networkRoutes.post("/products", async (c) => {
  const x = await body(c, ProductNew);
  if (x.brand !== "Fresh" && x.temp === "chilled") throw new OpError(400, "Only Fresh products can be chilled.");
  await c.var.svc.master(
    () => ({ ...who(c), action: "product.create", entity: "product", entityId: x.id, summary: `Added product ${x.id} ${x.name}` }),
    async (tx) => void (await tx.insert(t.products).values({ ...x, active: x.active ?? true })),
  );
  return c.json({ id: x.id }, 201);
});

networkRoutes.patch("/products/:id", async (c) => {
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

// ── Demo reset ─────────────────────────────────────────────────────────────────────────────────

networkRoutes.post("/reset", async (c) => {
  const svc = c.var.svc;
  await svc.replaceAll({ ...who(c), action: "ops.reset", summary: `Reset operations to the start of ${DEMO_DATE}` }, async (tx) => {
    await tx.execute(t.tableOrderForReset);
    const start = initialDb(dataset);
    for (const [vehicleId, status] of Object.entries(start.fleetStatus)) await tx.update(t.vehicles).set({ status }).where(eq(t.vehicles.id, vehicleId));
    await persist(tx, emptyOps(start.fleetStatus), start);
  });
  return c.json({ ok: true });
});
