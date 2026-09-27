// End-to-end through HTTP against an in-memory Postgres (PGlite): the judge walkthrough, plus the
// guarantees that matter — role checks, idempotent driver sync, audit trail, and state that survives a restart.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db as OpsDb, LoginResult, Snapshot } from "@waypoint/core/contract";
import { Service } from "./service.ts";
import { createApp } from "./app.ts";
import { boot } from "./boot.ts";
import type { Database } from "./db/client.ts";

let app: ReturnType<typeof createApp>;
let database: Database;
const tokens: Record<string, string> = {};

async function call<T = unknown>(method: string, path: string, body?: unknown, who?: string): Promise<{ status: number; json: T }> {
  const res = await app.request(path, {
    method,
    headers: { "content-type": "application/json", ...(who ? { authorization: `Bearer ${tokens[who]}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as T };
}
const op = <T = unknown>(name: string, args: unknown, who: string) => call<T>("POST", `/api/ops/${name}`, args, who);
const snapshot = async (who = "dispatcher") => (await call<Snapshot>("GET", "/api/ops/snapshot", undefined, who)).json;

beforeAll(async () => {
  const b = await boot({ dir: "memory://" });
  database = b.database;
  app = createApp(b.svc);
  for (const [u, appName] of [["admin", "admin"], ["dispatcher", "web"], ["loader", "web"], ["driver", "web"], ["store", "web"]] as const) {
    const r = await call<LoginResult>("POST", "/api/auth/login", { username: u, password: "waypoint", app: appName });
    expect(r.status, u).toBe(200);
    tokens[u] = r.json.token;
  }
}, 60_000);
afterAll(() => database.close());

describe("auth", () => {
  it("rejects a wrong password and sends HR to Waypoint People", async () => {
    expect((await call("POST", "/api/auth/login", { username: "dispatcher", password: "nope", app: "web" })).status).toBe(401);
    const r = await call<{ error: string; adminUrl: string }>("POST", "/api/auth/login", { username: "admin", password: "waypoint", app: "web" });
    expect(r.status).toBe(403);
    expect(r.json.adminUrl).toBeTruthy();
    expect((await call("POST", "/api/auth/login", { username: "driver", password: "waypoint", app: "admin" })).status).toBe(403);
  });
  it("describes the driver's session from the master data", async () => {
    const me = (await call<{ role: string; vehicleId: string }>("GET", "/api/auth/me", undefined, "driver")).json;
    expect(me).toMatchObject({ role: "driver", vehicleId: "VEH011" });
  });
  it("keeps roles in their lane", async () => {
    expect((await op("publishPlan", { depot: "Peliyagoda" }, "store")).status).toBe(403);
    expect((await call("GET", "/api/people/overview", undefined, "dispatcher")).status).toBe(403);
    expect((await call("GET", "/api/network/vehicles", undefined, "admin")).status).toBe(403);
    expect((await call("GET", "/api/ops/snapshot")).status).toBe(401);
  });
});

describe("walkthrough", () => {
  let orderId = "";
  it("store places an order", async () => {
    const r = await op<{ id: string; createdBy: string }>("placeOrder", { outletId: "OUT007", temp: "chilled", lines: [{ skuId: "F-MILK", qty: 10 }, { skuId: "F-YOG", qty: 4 }] }, "store");
    expect(r.status).toBe(200);
    expect(r.json.createdBy).toBe("Dilani Fernando"); // from the session, not the request
    orderId = r.json.id;
  });
  it("dispatcher closes orders, plans and publishes", async () => {
    const plan = await op<{ trips: unknown[]; deferred: unknown[] }>("closeOrdersAndPlan", { depot: "Peliyagoda" }, "dispatcher");
    expect(plan.status).toBe(200);
    expect(plan.json.trips.length).toBeGreaterThan(10);
    expect((await op("publishPlan", { depot: "Peliyagoda" }, "dispatcher")).status).toBe(200);
    const s = await snapshot();
    expect(s.db.plans.Peliyagoda?.status).toBe("published");
    expect(s.db.day.Peliyagoda).toMatchObject({ ordersClosed: true, closedBy: "Nimali Perera" });
    expect(s.db.orders.some((o) => o.id === orderId)).toBe(true);
    expect(Object.keys(s.db.loads).length).toBe(s.db.plans.Peliyagoda!.trips.length);
  });
  it("loader loads VEH011 and releases it", async () => {
    const s = await snapshot("loader");
    const trip = s.db.plans.Peliyagoda!.trips.find((x) => x.vehicleId === "VEH011")!;
    const lines = s.db.loads[trip.id].lines;
    expect((await op("releaseTrip", { tripId: trip.id }, "loader")).status).toBe(409);
    for (const [key, l] of Object.entries(lines)) expect((await op("setLoadLine", { tripId: trip.id, key, loaded: l.planned }, "loader")).status).toBe(200);
    expect((await op("releaseTrip", { tripId: trip.id }, "loader")).status).toBe(200);
  });
  it("driver sync is idempotent and only for their own vehicle", async () => {
    const s = await snapshot("driver");
    const trip = s.db.plans.Peliyagoda!.trips.find((x) => x.vehicleId === "VEH011")!;
    const stop = trip.orderIds[0];
    const events = [
      { id: "e-1", vehicleId: "VEH011", kind: "arrived", orderId: stop, at: "05:02", recordedAt: new Date().toISOString() },
      { id: "e-2", vehicleId: "VEH011", kind: "delivered", orderId: stop, at: "05:14", recordedAt: new Date().toISOString(), pod: { receivedBy: "Chamari", signed: true, photos: 1, lines: [] } },
    ];
    const first = await op<{ accepted: string[] }>("syncDriverEvents", { vehicleId: "VEH011", events }, "driver");
    expect(first.json.accepted).toEqual(["e-1", "e-2"]);
    const again = await op<{ accepted: string[]; duplicates: string[] }>("syncDriverEvents", { vehicleId: "VEH011", events }, "driver");
    expect(again.json).toMatchObject({ accepted: [], duplicates: ["e-1", "e-2"] });
    expect((await op("syncDriverEvents", { vehicleId: "VEH012", events: [] }, "driver")).status).toBe(403);
    expect((await snapshot()).db.stops[stop].deliveredAt).toBe("05:14");
  });
});

describe("people (HR)", () => {
  it("keeps a staff record for every role, linked to the demo logins", async () => {
    const staff = (await call<{ id: string; jobRole: string; login: { username: string } | null; driver: { vehicleId: string | null } | null }[]>("GET", "/api/people/staff", undefined, "admin")).json;
    for (const role of ["driver", "loader", "dispatcher", "store_manager", "hr_officer"]) expect(staff.some((s) => s.jobRole === role), role).toBe(true);
    for (const u of ["admin", "dispatcher", "loader", "driver", "store"]) expect(staff.some((s) => s.login?.username === u), u).toBe(true);
    expect(staff.find((s) => s.login?.username === "driver")?.driver?.vehicleId).toBe("VEH011");
  });
  it("adds a driver, issues a login, and dispatch puts them on a vehicle", async () => {
    const s = await call<{ id: string }>("POST", "/api/people/staff", { name: "Test Driver", jobRole: "driver", depotId: "Peliyagoda", status: "active", licenseNo: "B1234567", licenseClass: "C1", licenseExpiry: "2029-01-01" }, "admin");
    expect(s.status).toBe(201);
    const weak = await call("POST", `/api/people/staff/${s.json.id}/login`, { username: "tdriver", password: "short" }, "admin");
    expect(weak.status).toBe(400);
    const u = await call<{ id: string }>("POST", `/api/people/staff/${s.json.id}/login`, { username: "tdriver", password: "roadtrip42" }, "admin");
    expect(u.status).toBe(201);
    const staff = (await call<{ id: string; driver: { id: string } }[]>("GET", "/api/people/staff", undefined, "admin")).json;
    const driverId = staff.find((x) => x.id === s.json.id)!.driver.id;
    const v = (await call<{ id: string; type: string; temp: string; weightCapKg: number; volumeCapM3: number; fuelType: string; kmPerL: number; weeklyFuelQuotaL: number; depotId: string; status: string }[]>("GET", "/api/network/vehicles", undefined, "dispatcher")).json.find((x) => x.id === "VEH012")!;
    const { id: _id, ...rest } = v;
    void _id;
    const pick = { type: rest.type, temp: rest.temp, weightCapKg: rest.weightCapKg, volumeCapM3: rest.volumeCapM3, fuelType: rest.fuelType, kmPerL: rest.kmPerL, weeklyFuelQuotaL: rest.weeklyFuelQuotaL, depotId: rest.depotId, status: rest.status };
    expect((await call("PATCH", "/api/network/vehicles/VEH012", { ...pick, driverId }, "dispatcher")).status).toBe(200);
    const login = await call<LoginResult>("POST", "/api/auth/login", { username: "tdriver", password: "roadtrip42", app: "web" });
    expect(login.json.user).toMatchObject({ role: "driver", vehicleId: "VEH012" });
  });
  it("turns off sign-in when someone leaves", async () => {
    const staff = (await call<{ id: string; name: string; jobRole: string; depotId: string; status: string; login: { username: string } | null }[]>("GET", "/api/people/staff", undefined, "admin")).json;
    const t = staff.find((x) => x.login?.username === "tdriver")!;
    expect((await call("PATCH", `/api/people/staff/${t.id}`, { name: t.name, jobRole: t.jobRole, depotId: t.depotId, status: "left" }, "admin")).status).toBe(200);
    expect((await call("POST", "/api/auth/login", { username: "tdriver", password: "roadtrip42", app: "web" })).status).toBe(403);
  });
  it("won't let HR remove their own access", async () => {
    const staff = (await call<{ id: string; name: string; jobRole: string; depotId: string; login: { username: string } | null }[]>("GET", "/api/people/staff", undefined, "admin")).json;
    const me = staff.find((x) => x.login?.username === "admin")!;
    expect((await call("PATCH", `/api/people/staff/${me.id}`, { name: me.name, jobRole: me.jobRole, depotId: me.depotId, status: "left" }, "admin")).status).toBe(409);
  });
});

describe("network (dispatch)", () => {
  it("won't retire a vehicle that is in today's plan", async () => {
    const v = (await call<{ id: string; tripsToday: number }[]>("GET", "/api/network/vehicles", undefined, "dispatcher")).json.find((x) => x.id === "VEH011")!;
    expect(v.tripsToday).toBeGreaterThan(0);
    const r = await call("PATCH", "/api/network/vehicles/VEH011", { type: "truck", temp: "ambient", weightCapKg: 1, volumeCapM3: 1, fuelType: "diesel", kmPerL: 5, weeklyFuelQuotaL: 100, depotId: "Peliyagoda", status: "available", active: false }, "dispatcher");
    expect(r.status).toBe(409);
  });
  it("records every action in the activity log", async () => {
    const people = (await call<{ action: string }[]>("GET", "/api/people/activity?limit=200", undefined, "admin")).json.map((r) => r.action);
    for (const a of ["staff.create", "staff.update", "user.create", "auth.login"]) expect(people).toContain(a);
    expect(people.some((a) => a.startsWith("ops."))).toBe(false);
  });
  it("state survives a restart (reloaded from the tables)", async () => {
    const before = (await snapshot()).db;
    const fresh = new Service(database.db);
    await fresh.start();
    const strip = (d: OpsDb) => JSON.parse(JSON.stringify(d));
    expect(fresh.ops.day.Peliyagoda.ordersClosed).toBe(true);
    expect(strip(fresh.ops)).toEqual(strip(before));
  });
  it("resets operations to the start of the demo day", async () => {
    expect((await call("POST", "/api/network/reset", {}, "dispatcher")).status).toBe(200);
    const s = await snapshot();
    expect(s.db.plans.Peliyagoda).toBeNull();
    expect(Object.keys(s.db.stops)).toHaveLength(0);
  });
});
