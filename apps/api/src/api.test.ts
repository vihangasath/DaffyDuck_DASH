// End-to-end through HTTP against an in-memory Postgres (PGlite): the judge walkthrough, plus the
// guarantees that matter — role checks, idempotent driver sync, audit trail, and state that survives a restart.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db as OpsDb, LoginResult, PhotoMeta, Snapshot, SyncResult } from "@waypoint/core/contract";
import { orderState } from "@waypoint/core/views";
import { net } from "@waypoint/core/reference";
import { Service } from "./service.ts";
import { createApp } from "./app.ts";
import { boot } from "./boot.ts";
import type { Database } from "./db/client.ts";
import { env } from "./env.ts";
import { watchOnce } from "./monitor.ts";

let app: ReturnType<typeof createApp>;
let svc: Service;
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

/** Signs in as a branch's own store manager (the named demo `store` account manages OUT007). */
async function storeOf(outletId: string): Promise<string> {
  const who = outletId === "OUT007" ? "store" : `store-${outletId.toLowerCase()}`;
  if (!tokens[who]) {
    const r = await call<LoginResult>("POST", "/api/auth/login", { username: who, password: "waypoint", app: "web" });
    expect(r.status, who).toBe(200);
    tokens[who] = r.json.token;
  }
  return who;
}
const managerOf = async (orderId: string) => storeOf((await snapshot()).db.orders.find((o) => o.id === orderId)!.outletId);
const snapshot = async (who = "dispatcher") => (await call<Snapshot>("GET", "/api/ops/snapshot", undefined, who)).json;

beforeAll(async () => {
  const b = await boot({ dir: "memory://" });
  database = b.database;
  svc = b.svc;
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

describe("store managers", () => {
  it("sign in to their own branch and nowhere else", async () => {
    const me = (await call<{ role: string; outletId: string; title: string }>("GET", "/api/auth/me", undefined, await storeOf("OUT001"))).json;
    expect(me).toMatchObject({ role: "store", outletId: "OUT001" });
    expect((await op("placeOrder", { outletId: "OUT007", temp: "ambient", lines: [{ skuId: "F-RICE", qty: 1 }] }, await storeOf("OUT001"))).status).toBe(403);
    const db = (await snapshot(await storeOf("OUT001"))).db;
    expect(db.orders.filter((o) => o.lines).every((o) => o.outletId === "OUT001")).toBe(true);
  });
  it("Kandy has its own loader and driver", async () => {
    for (const u of ["loader-kandy", "driver-kandy"]) {
      const r = await call<LoginResult>("POST", "/api/auth/login", { username: u, password: "waypoint", app: "web" });
      expect(r.status, u).toBe(200);
      expect(r.json.user.depot).toBe("Kandy");
    }
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
    const manager = await storeOf(order.outletId);
    if (order.outletId !== "OUT007") expect((await op("confirmReceipt", { orderId: stop, lines: receiptLines, issues: [] }, "store")).status).toBe(403);
    expect((await op("confirmReceipt", { orderId: stop, lines: receiptLines.map((l) => ({ ...l, driverQty: l.driverQty + 1 })), issues: [] }, manager)).status).toBe(400);
    expect((await op("confirmReceipt", { orderId: stop, lines: receiptLines, issues: [{ type: "Damaged", note: "One carton dented" }] }, manager)).status).toBe(200);
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
    const store = (await snapshot("store")).db; // OUT007's manager: that branch only
    expect(store.exceptions).toEqual([]);
    expect(store.notices.every((n) => n.outletId === "OUT007")).toBe(true);
    expect(store.orders.filter((o) => o.lines).every((o) => o.outletId === "OUT007")).toBe(true);
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

describe("proof in the field", () => {
  const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const put = async (id: string, kind: string, orderId: string, who: string, type = "image/png") => {
    const res = await app.request(`/api/photos/${id}?kind=${kind}&orderId=${encodeURIComponent(orderId)}`, { method: "PUT", headers: { "content-type": type, authorization: `Bearer ${tokens[who]}` }, body: PNG });
    return { status: res.status, json: (await res.json()) as PhotoMeta & { error?: string } };
  };
  const get = (id: string, who: string) => app.request(`/api/photos/${id}`, { headers: { authorization: `Bearer ${tokens[who]}` } });
  const iso = (minsAgo = 0) => new Date(Date.now() - minsAgo * 60_000).toISOString();
  let trips: { id: string; orderIds: string[] }[] = [];
  const all = () => trips.flatMap((t) => t.orderIds);
  const podLines = (d: OpsDb, id: string) => d.orders.find((o) => o.id === id)!.lines!.map((l) => ({ skuId: l.skuId, name: l.name, planned: l.qty, delivered: l.qty }));

  beforeAll(async () => {
    // A clean, published day with every VEH011 trip loaded and on the road.
    expect((await call("POST", "/api/network/reset", {}, "dispatcher")).status).toBe(200);
    expect((await op("closeOrdersAndPlan", { depot: "Peliyagoda" }, "dispatcher")).status).toBe(200);
    expect((await op("publishPlan", { depot: "Peliyagoda" }, "dispatcher")).status).toBe(200);
    const d = (await snapshot()).db;
    trips = d.plans.Peliyagoda!.trips.filter((t) => t.vehicleId === "VEH011");
    for (const t of trips) {
      for (const [key, l] of Object.entries(d.loads[t.id].lines)) await op("setLoadLine", { tripId: t.id, key, loaded: l.planned }, "loader");
      expect((await op("releaseTrip", { tripId: t.id }, "loader")).status).toBe(200);
    }
    expect(all().length).toBeGreaterThan(1);
  });

  it("gives every order a delivery code only the dispatcher and the ordering store can read", async () => {
    const d = (await snapshot()).db;
    expect(d.orders.every((o) => /^\d{6}$/.test(o.confirmCode ?? ""))).toBe(true);
    expect((await snapshot("driver")).db.orders.some((o) => o.confirmCode)).toBe(false);
    expect((await snapshot("loader")).db.orders.some((o) => o.confirmCode)).toBe(false);
    const store = (await snapshot("store")).db; // own = OUT007's orders; the rest only share its trucks
    expect(store.orders.filter((o) => o.lines).every((o) => o.confirmCode)).toBe(true);
    expect(store.orders.filter((o) => !o.lines).some((o) => o.confirmCode)).toBe(false);
  });

  it("checks a code at the stop, with a limit on wrong guesses", async () => {
    const id = all()[0];
    const code = (await snapshot()).db.orders.find((o) => o.id === id)!.confirmCode!;
    const wrong = code === "000000" ? "111111" : "000000";
    expect((await call<{ ok: boolean; attemptsLeft: number }>("POST", "/api/ops/checkCode", { orderId: id, code: wrong }, "driver")).json).toEqual({ ok: false, attemptsLeft: 4 });
    expect((await call<{ ok: boolean }>("POST", "/api/ops/checkCode", { orderId: id, code }, "driver")).json.ok).toBe(true);
    expect((await call("POST", "/api/ops/checkCode", { orderId: id, code }, "store")).status).toBe(403);
    const other = (await snapshot()).db.plans.Peliyagoda!.trips.find((t) => t.vehicleId !== "VEH011")!.orderIds[0];
    expect((await call("POST", "/api/ops/checkCode", { orderId: other, code }, "driver")).status).toBe(403);
  });

  it("stores delivery photos and serves them to dispatch and the store, not to other roles", async () => {
    const id = all()[0];
    const up = await put("photo-pod-0001", "pod", id, "driver");
    expect(up.status).toBe(200);
    expect(up.json).toMatchObject({ id: "photo-pod-0001", kind: "pod", orderId: id, vehicleId: "VEH011", bytes: PNG.length });
    expect((await put("photo-pod-0001", "pod", id, "driver")).json.at).toBe(up.json.at); // idempotent retry
    expect((await put("photo-pod-0002", "pod", id, "driver", "text/plain")).status).toBe(415);
    const other = (await snapshot()).db.plans.Peliyagoda!.trips.find((t) => t.vehicleId !== "VEH011")!.orderIds[0];
    expect((await put("photo-pod-0003", "pod", other, "driver")).status).toBe(403);
    const img = await get("photo-pod-0001", "dispatcher");
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(PNG);
    expect((await get("photo-pod-0001", await managerOf(id))).status).toBe(200);
    expect((await get("photo-pod-0001", "loader")).status).toBe(404);
  });

  it("records the delivery code and photos with the POD and flags a wrong code", async () => {
    const d = (await snapshot()).db;
    const [good, bad] = all();
    const code = d.orders.find((o) => o.id === good)!.confirmCode!;
    const r = await op<SyncResult>("syncDriverEvents", {
      vehicleId: "VEH011", events: [
        { id: "fp-a1", vehicleId: "VEH011", kind: "arrived", orderId: good, at: "05:00", recordedAt: iso(20) },
        { id: "fp-d1", vehicleId: "VEH011", kind: "delivered", orderId: good, at: "05:12", recordedAt: iso(10), pod: { receivedBy: "Chamari", signed: true, photos: 1, photoIds: ["photo-pod-0001"], lines: podLines(d, good), code } },
        { id: "fp-a2", vehicleId: "VEH011", kind: "arrived", orderId: bad, at: "05:30", recordedAt: iso(5) },
        { id: "fp-d2", vehicleId: "VEH011", kind: "delivered", orderId: bad, at: "05:40", recordedAt: iso(1), pod: { receivedBy: "Someone", signed: true, photos: 0, lines: podLines(d, bad), code: code === "123456" ? "654321" : "123456" } },
      ],
    }, "driver");
    expect(r.json.accepted).toHaveLength(4);
    const after = (await snapshot()).db;
    expect(after.stops[good].pod).toMatchObject({ code, codeOk: true, photoIds: ["photo-pod-0001"], photos: 1 });
    expect(after.stops[bad].pod?.codeOk).toBe(false);
    expect(after.exceptions.filter((e) => e.kind === "pod_code").map((e) => e.ref.orderId)).toEqual([bad]);
    expect((await snapshot("driver")).db.stops[good].pod?.codeOk).toBeUndefined();
  });

  it("keeps the loader's damage photo with the shortfall", async () => {
    const d = (await snapshot("loader")).db;
    const trip = d.plans.Peliyagoda!.trips.find((t) => t.vehicleId !== "VEH011" && d.loads[t.id].status !== "released")!;
    const [key, line] = Object.entries(d.loads[trip.id].lines)[0];
    const [orderId, skuId] = key.split("|");
    expect((await put("photo-dock-0001", "shortfall", orderId, "loader")).status).toBe(200);
    expect((await op("flagShortfall", { tripId: trip.id, orderId, skuId, loaded: 0, kind: "damaged", decision: "hold", photo: true, photoIds: ["photo-nope-0001"] }, "loader")).status).toBe(400);
    const f = await op<{ id: string; photoIds: string[] }>("flagShortfall", { tripId: trip.id, orderId, skuId, loaded: Math.max(0, line.planned - 1), kind: "damaged", decision: "hold", photo: true, photoIds: ["photo-dock-0001"] }, "loader");
    expect(f.json.photoIds).toEqual(["photo-dock-0001"]);
    const e = (await snapshot()).db.exceptions.find((x) => x.ref.shortfallId === f.json.id)!;
    expect(e.body).toContain("1 photo from the dock");
    expect((await get("photo-dock-0001", "dispatcher")).status).toBe(200);
    expect((await get("photo-dock-0001", await managerOf(orderId))).status).toBe(404);
  });

  it("alerts dispatch to a long stop and tells the later stores they will be late", async () => {
    const pending = all().filter((id) => !svc.ops.stops[id]?.deliveredAt);
    const here = pending[0];
    expect((await op<SyncResult>("syncDriverEvents", { vehicleId: "VEH011", events: [{ id: "fp-a3", vehicleId: "VEH011", kind: "arrived", orderId: here, at: "06:00", recordedAt: iso(240) }] }, "driver")).json.accepted).toEqual(["fp-a3"]);
    const r = await watchOnce(svc);
    expect(r.dwell).toEqual([here]);
    const d = (await snapshot()).db;
    const dwell = d.exceptions.find((e) => e.kind === "dwell")!;
    expect(dwell.ref).toMatchObject({ orderId: here, vehicleId: "VEH011" });
    expect(dwell.resolved).toBeFalsy();
    // Four hours at one stop pushes later stops past their windows (a wide afternoon window may still hold).
    expect(r.late.length).toBeGreaterThan(0);
    expect(r.late.every((id) => pending.slice(1).includes(id))).toBe(true);
    const late = d.notices.filter((n) => n.kind === "late");
    expect(late.every((n) => n.lateMin! >= 5 && n.body.startsWith("We’re sorry, we’ll be about"))).toBe(true);
    expect((await watchOnce(svc)).late).toEqual([]); // no repeats until it slips another 15 min
    if (late.length) {
      expect((await op("ackNotice", { id: late[0].id, response: "reduce" }, await storeOf(late[0].outletId))).status).toBe(200);
      expect((await snapshot()).db.exceptions.find((e) => e.kind === "late_reply")).toMatchObject({ severity: "warning", ref: { orderId: late[0].orderId } });
    }
    // Leaving the stop answers the dwell alert.
    await op("syncDriverEvents", { vehicleId: "VEH011", events: [{ id: "fp-p3", vehicleId: "VEH011", kind: "problem", orderId: here, at: "10:00", recordedAt: iso(0), problem: { reason: "Store closed" } }] }, "driver");
    expect((await snapshot()).db.exceptions.find((e) => e.kind === "dwell")!.resolved).toBe(true);
  });

  it("keeps the phone's location, connectivity log and a check that every record reached the database", async () => {
    const link = [{ id: "net-1", state: "offline", at: iso(30) }, { id: "net-2", state: "online", at: iso(12) }];
    const r = await op<SyncResult>("syncDriverEvents", {
      vehicleId: "VEH011", events: [],
      position: { lat: 6.93, lng: 79.86, accuracyM: 18, at: iso(0) },
      connectivity: link,
      check: { syncedIds: ["fp-a1", "fp-d1", "ghost-1"], queued: 1, rejected: 0, oldestQueuedAt: iso(3) },
    }, "driver");
    expect(r.json.missing).toEqual(["ghost-1"]);
    await op("syncDriverEvents", { vehicleId: "VEH011", events: [], connectivity: link, position: { lat: 6.94, lng: 79.87, accuracyM: 12, at: iso(0) } }, "driver");
    const d = (await snapshot()).db;
    expect(d.driverSync.VEH011.position).toMatchObject({ lat: 6.94, lng: 79.87, accuracyM: 12 });
    expect(d.driverSync.VEH011.trail).toHaveLength(2);
    expect(d.driverSync.VEH011.check).toMatchObject({ phoneSynced: 3, phoneQueued: 1, photosQueued: 0, missing: ["ghost-1"] });
    expect(d.connectivity.filter((c) => c.vehicleId === "VEH011").map((c) => c.state)).toEqual(["online", "offline"]);
    expect((await snapshot("store")).db.connectivity).toEqual([]);
    expect((await snapshot("store")).db.driverSync).toEqual({});
  });

  it("sends dispatch an itemised receipt with the store's photos", async () => {
    const d = (await snapshot()).db;
    const id = all()[0];
    const pod = d.stops[id].pod!;
    const manager = await managerOf(id);
    expect((await put("photo-rcpt-0001", "receipt", id, manager)).status).toBe(200);
    const lines = pod.lines.map((l, i) => ({ skuId: l.skuId, name: l.name, driverQty: l.delivered, receivedQty: i === 0 ? l.delivered - 1 : l.delivered, damagedQty: i === 0 ? 1 : 0 }));
    expect((await op("confirmReceipt", { orderId: id, lines: lines.map((l) => ({ ...l, damagedQty: l.receivedQty + 1 })), issues: [] }, manager)).status).toBe(400);
    expect((await op("confirmReceipt", { orderId: id, lines, issues: [{ type: "Count differs from driver" }], photoIds: ["photo-rcpt-0001"] }, manager)).status).toBe(200);
    const after = (await snapshot()).db;
    expect(after.receipts[id].photoIds).toEqual(["photo-rcpt-0001"]);
    const e = after.exceptions.find((x) => x.kind === "receipt_issue" && x.ref.orderId === id)!;
    expect(e.title).toContain("missing & damaged");
    expect(e.body).toContain(`Missing: 1 × ${lines[0].name}`);
    expect(e.body).toContain(`Damaged: 1 × ${lines[0].name}`);
    expect(e.body).toContain("1 driver photo · 1 store photo");
    expect((await get("photo-rcpt-0001", "driver")).status).toBe(404);
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
