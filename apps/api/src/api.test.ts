// End-to-end through HTTP against an in-memory Postgres (PGlite): the judge walkthrough, plus the
// guarantees that matter — role checks, idempotent driver sync, audit trail, and state that survives a restart.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db as OpsDb, LoginResult, Snapshot } from "@waypoint/core/contract";
import { orderState } from "@waypoint/core/views";
import { net } from "@waypoint/core/reference";
import { Service } from "./service.ts";
import { createApp } from "./app.ts";
import { boot } from "./boot.ts";
import type { Database } from "./db/client.ts";
import { env } from "./env.ts";

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
    expect((await op("placeOrder", { outletId: "OUT007", temp: "chilled", lines: [{ skuId: "F-RICE", qty: 1 }] }, "store")).status).toBe(400);
    expect((await op("placeOrder", { outletId: "OUT007", temp: "chilled", lines: [{ skuId: "F-MILK", qty: 1 }, { skuId: "T-TV", qty: 1 }] }, "store")).status).toBe(400);
    const r = await op<{ id: string; createdBy: string }>("placeOrder", { outletId: "OUT007", temp: "chilled", lines: [{ skuId: "F-MILK", qty: 10 }, { skuId: "F-YOG", qty: 4 }] }, "store");
    expect(r.status).toBe(200);
    expect(r.json.createdBy).toBe("Dilani Fernando"); // from the session, not the request
    orderId = r.json.id;
  });
  it("dispatcher closes orders, plans and publishes", async () => {
    const plan = await op<{ trips: unknown[]; deferred: unknown[] }>("closeOrdersAndPlan", { depot: "Peliyagoda" }, "dispatcher");
    expect(plan.status).toBe(200);
    expect(plan.json.trips.length).toBeGreaterThan(10);
    expect((await op("closeOrdersAndPlan", { depot: "Peliyagoda" }, "dispatcher")).status).toBe(409);
    expect((await op("moveOrder", { depot: "Kandy", orderId, target: { defer: true } }, "dispatcher")).status).toBe(404);
    expect((await op("publishPlan", { depot: "Peliyagoda" }, "dispatcher")).status).toBe(200);
    const s = await snapshot();
    expect(s.db.plans.Peliyagoda?.status).toBe("published");
    expect(s.db.day.Peliyagoda).toMatchObject({ ordersClosed: true, closedBy: "Nimali Perera" });
    expect(s.db.orders.some((o) => o.id === orderId)).toBe(true);
    expect(Object.keys(s.db.loads).length).toBe(s.db.plans.Peliyagoda!.trips.length);
  });
  it("loader loads VEH011 and releases it", async () => {
    const s = await snapshot("loader");
    const trip = s.db.plans.Peliyagoda!.trips.find((x) => x.vehicleId === "VEH011" && x.orderIds.length > 1) ?? s.db.plans.Peliyagoda!.trips.find((x) => x.vehicleId === "VEH011")!;
    const lines = s.db.loads[trip.id].lines;
    expect((await op("releaseTrip", { tripId: trip.id }, "loader")).status).toBe(409);
    for (const [key, l] of Object.entries(lines)) expect((await op("setLoadLine", { tripId: trip.id, key, loaded: l.planned }, "loader")).status).toBe(200);
    expect((await op("releaseTrip", { tripId: trip.id }, "loader")).status).toBe(200);
    const firstKey = Object.keys(lines)[0];
    const [firstOrder, firstSku] = firstKey.split("|");
    expect((await op("flagShortfall", { tripId: trip.id, orderId: firstOrder, skuId: firstSku, loaded: 0, kind: "missing", decision: "hold", photo: false }, "loader")).status).toBe(409);
  });
  it("holds a short load until dispatch resolves it and the loader re-picks", async () => {
    const s = await snapshot("loader");
    const trip = s.db.plans.Peliyagoda!.trips.find((x) => x.vehicleId !== "VEH011" && Object.keys(s.db.loads[x.id].lines).length > 1)!;
    const [key, line] = Object.entries(s.db.loads[trip.id].lines)[0];
    const [orderId, skuId] = key.split("|");
    const flag = await op<{ id: string }>("flagShortfall", { tripId: trip.id, orderId, skuId, loaded: 0, kind: "missing", decision: "hold", photo: false }, "loader");
    expect(flag.status).toBe(200);
    expect((await op("releaseTrip", { tripId: trip.id }, "loader")).status).toBe(409);
    expect((await op("resolveShortfall", { id: flag.json.id, resolution: "release" }, "dispatcher")).status).toBe(409);
    expect((await op("resolveShortfall", { id: flag.json.id, resolution: "repick" }, "dispatcher")).status).toBe(200);
    expect((await op("releaseTrip", { tripId: trip.id }, "loader")).status).toBe(409);
    expect((await op("setLoadLine", { tripId: trip.id, key, loaded: line.planned }, "loader")).status).toBe(200);
    expect((await op("resolveShortfall", { id: flag.json.id, resolution: "release" }, "dispatcher")).status).toBe(409);
  });
  it("driver sync is idempotent and only for their own vehicle", async () => {
    const s = await snapshot("driver");
    const trip = s.db.plans.Peliyagoda!.trips.find((x) => x.vehicleId === "VEH011" && x.orderIds.length > 1) ?? s.db.plans.Peliyagoda!.trips.find((x) => x.vehicleId === "VEH011")!;
    const stop = trip.orderIds[0];
    const order = s.db.orders.find((o) => o.id === stop)!;
    const lines = order.lines!.map((l) => ({ skuId: l.skuId, name: l.name, planned: l.qty, delivered: l.qty }));
    const wrongStop = (await snapshot()).db.plans.Peliyagoda!.trips.find((x) => x.vehicleId !== "VEH011")!.orderIds[0];
    const rejected = await op<{ rejected: { id: string; reason: string; retry?: boolean }[] }>("syncDriverEvents", {
      vehicleId: "VEH011", events: [{ id: "wrong-stop", vehicleId: "VEH011", kind: "arrived", orderId: wrongStop, at: "05:01", recordedAt: new Date().toISOString() }],
    }, "driver");
    expect(rejected.status).toBe(200);
    expect(rejected.json.rejected[0]).toMatchObject({ id: "wrong-stop", retry: false });
    expect((await snapshot()).db.stops[wrongStop]).toBeUndefined();
    const badPod = await op<{ rejected: { id: string }[] }>("syncDriverEvents", {
      vehicleId: "VEH011", events: [{ id: "bad-pod", vehicleId: "VEH011", kind: "delivered", orderId: stop, at: "05:03", recordedAt: new Date().toISOString(), pod: { receivedBy: "Chamari", signed: true, photos: 0, lines: [] } }],
    }, "driver");
    expect(badPod.json.rejected[0].id).toBe("bad-pod");
    const events = [
      { id: "e-1", vehicleId: "VEH011", kind: "arrived", orderId: stop, at: "05:02", recordedAt: new Date().toISOString() },
      { id: "e-2", vehicleId: "VEH011", kind: "delivered", orderId: stop, at: "05:14", recordedAt: new Date().toISOString(), pod: { receivedBy: "Chamari", signed: true, photos: 1, lines } },
    ];
    const first = await op<{ accepted: string[] }>("syncDriverEvents", { vehicleId: "VEH011", events }, "driver");
    expect(first.json.accepted).toEqual(["e-1", "e-2"]);
    const again = await op<{ accepted: string[]; duplicates: string[] }>("syncDriverEvents", { vehicleId: "VEH011", events }, "driver");
    expect(again.json).toMatchObject({ accepted: [], duplicates: ["e-1", "e-2"] });
    expect((await op("syncDriverEvents", { vehicleId: "VEH012", events: [] }, "driver")).status).toBe(403);
    expect((await snapshot()).db.stops[stop].deliveredAt).toBe("05:14");
    const receiptLines = lines.map((l) => ({ skuId: l.skuId, name: l.name, driverQty: l.delivered, receivedQty: l.delivered }));
    expect((await op("confirmReceipt", { orderId: stop, lines: receiptLines.map((l) => ({ ...l, driverQty: l.driverQty + 1 })), issues: [] }, "store")).status).toBe(400);
    expect((await op("confirmReceipt", { orderId: stop, lines: receiptLines, issues: [{ type: "Damaged", note: "One carton dented" }] }, "store")).status).toBe(200);
    expect((await snapshot()).db.receipts[stop].issues).toHaveLength(1);
  });
  it("asks the phone to keep a record queued until the loader releases the trip", async () => {
    const d = (await snapshot()).db;
    const unreleased = d.plans.Peliyagoda!.trips.find((x) => x.vehicleId === "VEH011" && d.loads[x.id].status !== "released");
    if (!unreleased) return; // VEH011 runs a single trip on this seed
    const r = await op<{ rejected: { id: string; retry?: boolean }[] }>("syncDriverEvents", {
      vehicleId: "VEH011", events: [{ id: "early", vehicleId: "VEH011", kind: "arrived", orderId: unreleased.orderIds[0], at: "09:00", recordedAt: new Date().toISOString() }],
    }, "driver");
    expect(r.json.rejected).toEqual([expect.objectContaining({ id: "early", retry: true })]);
  });
  it("gives each role only its own slice of the operational state", async () => {
    const all = (await snapshot()).db;
    const store = (await snapshot("store")).db; // area manager: every Peliyagoda branch
    expect(store.exceptions).toEqual([]);
    expect(store.notices.every((n) => net.outlets.get(n.outletId)?.depot === "Peliyagoda")).toBe(true);
    expect(store.orders.filter((o) => o.depot === "Kandy" && o.lines)).toEqual([]);
    expect(store.plans.Peliyagoda!.trips).toEqual(all.plans.Peliyagoda!.trips); // ETAs need the whole trip
    const driver = (await snapshot("driver")).db;
    expect(driver.plans.Peliyagoda!.trips.every((t) => t.vehicleId === "VEH011")).toBe(true);
    expect(Object.values(driver.stops).every((x) => x.vehicleId === "VEH011")).toBe(true);
    expect(Object.values(driver.loads).every((l) => l.vehicleId === "VEH011")).toBe(true);
    expect([driver.notices, driver.exceptions, driver.deferralLog, driver.processedEventIds]).toEqual([[], [], [], []]);
    const loader = (await snapshot("loader")).db;
    expect(loader.plans.Kandy).toBeNull();
    expect(loader.orders.every((o) => o.depot === "Peliyagoda")).toBe(true);
    expect(Object.keys(loader.receipts)).toEqual([]);
  });
  it("reconciles a released stop delivered offline after dispatch deferred it", async () => {
    const s = await snapshot("driver");
    const trip = s.db.plans.Peliyagoda!.trips.find((x) => x.vehicleId === "VEH011" && x.orderIds.length > 1)!;
    const id = trip.orderIds.find((x) => !s.db.stops[x]?.deliveredAt)!;
    expect(s.db.stops[id]?.vehicleId).toBe("VEH011"); // assignment recorded at dock release
    const moved = await op<{ ok: boolean }>("moveOrder", { depot: "Peliyagoda", orderId: id, target: { defer: true, note: "Driver was offline" } }, "dispatcher");
    expect(moved.json.ok).toBe(true);
    const order = s.db.orders.find((o) => o.id === id)!;
    const lines = order.lines!.map((l) => ({ skuId: l.skuId, name: l.name, planned: l.qty, delivered: l.qty }));
    const sync = await op<{ accepted: string[] }>("syncDriverEvents", {
      vehicleId: "VEH011", events: [
        { id: "late-arrived", vehicleId: "VEH011", kind: "arrived", orderId: id, at: "05:20", recordedAt: new Date().toISOString() },
        { id: "late-delivered", vehicleId: "VEH011", kind: "delivered", orderId: id, at: "05:32", recordedAt: new Date().toISOString(), pod: { receivedBy: "Store lead", signed: true, photos: 0, lines } },
      ],
    }, "driver");
    expect(sync.json.accepted).toEqual(["late-arrived", "late-delivered"]);
    const current = (await snapshot()).db;
    expect(orderState(current, id).status).toBe("delivered");
    expect(current.plans.Peliyagoda!.deferred.some((d) => d.orderId === id)).toBe(true);
  });
});

describe("Datathon models", () => {
  type Status = { configured: boolean; task1: { source: string; model?: string; orders: number }; task2a: { source: string } };
  type Forecast = { source: string; rows: { brand: string; pred_total_volume_m3: number; pred_chilled_volume_m3: number }[] };

  it("serves the baselines while no model service is configured", async () => {
    expect((await call<Status>("GET", "/api/models", undefined, "dispatcher")).json).toMatchObject({ configured: false, task1: { source: "baseline" }, task2a: { source: "baseline" } });
    expect((await call("GET", "/api/models", undefined, "driver")).status).toBe(403);
    const f = (await call<Forecast>("GET", "/api/forecast?depot=Kandy&weeks=2", undefined, "dispatcher")).json;
    expect(f.source).toBe("baseline");
    expect(f.rows).toHaveLength(6); // 3 brands × 2 weeks
  });

  it("feeds a connected model's answers to the planner and the capacity forecast", async () => {
    // A stand-in for apps/models: Task 1 answers, Task 2A has no model file yet (503) until `has2a`.
    const seen: Record<string, Record<string, string | number>[]> = {};
    let has2a = false;
    const server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const rows = (JSON.parse(raw) as { rows: Record<string, string | number>[] }).rows;
        seen[req.url!] = rows;
        const send = (status: number, body: unknown) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
        if (req.url === "/predict/task1")
          return send(200, { model: "fake-v1", predictions: rows.map((r) => ({ delivery_id: r.delivery_id, pred_service_min: 25, pred_late_prob: 0.9 })) });
        if (!has2a) return send(503, { error: "No task2a model yet." });
        send(200, { model: "fake-v1", predictions: rows.map((r) => ({ row_id: r.row_id, pred_total_volume_m3: 123.4, pred_chilled_volume_m3: r.brand === "Fresh" ? 50 : 0 })) });
      });
    });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    env.modelUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const s = (await call<Status>("POST", "/api/models/refresh", undefined, "dispatcher")).json;
      expect(s).toMatchObject({ configured: true, task1: { source: "model", model: "fake-v1" }, task2a: { source: "baseline" } });
      // The model gets the Datathon test-file columns for every planned stop.
      const row = seen["/predict/task1"][0];
      expect(Object.keys(row)).toEqual(expect.arrayContaining(["delivery_id", "seq_in_route", "planned_arrival_time", "window_close_time", "from_point", "distance_km", "planned_travel_duration_min", "dow"]));
      expect(s.task1.orders).toBe(seen["/predict/task1"].length);
      expect(seen["/forecast/task2a"][0]).toMatchObject({ depot: expect.any(String), iso_year: expect.any(Number), iso_week: expect.any(Number) });
      // Clients receive the predictions with the reference data; the shared planner uses them.
      const id = String(row.delivery_id);
      expect((await snapshot()).reference.predictions?.task1.byOrder[id]).toEqual({ serviceMin: 25, lateProb: 0.9 });
      expect(net.lateProb(id)).toBe(0.9);
      expect((await call<Forecast>("GET", "/api/forecast?depot=Kandy&weeks=1", undefined, "dispatcher")).json.source).toBe("baseline");

      has2a = true;
      await call("POST", "/api/models/refresh", undefined, "dispatcher");
      const f = (await call<Forecast>("GET", "/api/forecast?depot=Kandy&weeks=1", undefined, "dispatcher")).json;
      expect(f.source).toBe("model");
      expect(f.rows.map((r) => [r.brand, r.pred_total_volume_m3, r.pred_chilled_volume_m3]).sort()).toEqual([["Fresh", 123.4, 50], ["Style", 123.4, 0], ["Tech", 123.4, 0]]);
    } finally {
      server.close();
      env.modelUrl = undefined;
    }
    // Disconnecting the service returns every screen to the baselines.
    await call("POST", "/api/models/refresh", undefined, "dispatcher");
    expect((await call<Status>("GET", "/api/models", undefined, "dispatcher")).json).toMatchObject({ task1: { source: "baseline" }, task2a: { source: "baseline" } });
    expect(net.lateProb(String(seen["/predict/task1"][0].delivery_id))).toBeUndefined();
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
