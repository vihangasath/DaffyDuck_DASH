// Operational endpoints for the web app: one snapshot read plus one POST per business operation.
// Every POST runs the rule from @waypoint/core/ops as the signed-in user and is audited.
import { Hono } from "hono";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import type { DriverEvent, Snapshot, SyncExtras } from "@waypoint/core/contract";
import { ops, visibleTo, type Actor } from "@waypoint/core/ops";
import { outletName } from "@waypoint/core/reference";
import * as t from "../db/schema.ts";
import { actorOf } from "../auth.ts";
import { body, requireAuth, type Env } from "../http.ts";
import { refreshPredictions } from "../models.ts";
import { reference } from "../reference.ts";
import type { AuditEntry, Service } from "../service.ts";

const Depot = z.enum(["Peliyagoda", "Kandy"]);
const Id = z.string().min(1).max(80);
const DeferralCode = z.enum(["REEFER_CAPACITY", "VAN_CAPACITY", "FRESH_WINDOW", "DAY_BUDGET", "MALL_WINDOW", "FUEL_QUOTA", "CAPACITY", "OVERSIZE", "NO_VEHICLE", "MANUAL"]);
const Hhmm = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const PodLine = z.object({ skuId: Id, name: z.string().max(120), planned: z.number().int().min(0), delivered: z.number().int().min(0) });
const Code = z.string().regex(/^\d{6}$/, "a delivery code is 6 digits");
const PhotoIds = z.array(Id).max(10);
const Iso = z.string().max(40).refine((v) => Number.isFinite(Date.parse(v)), "use an ISO time");
const Event = z.discriminatedUnion("kind", [
  z.object({ id: Id, vehicleId: Id, kind: z.literal("arrived"), orderId: Id, at: Hhmm, recordedAt: z.string() }),
  z.object({
    id: Id, vehicleId: Id, kind: z.literal("delivered"), orderId: Id, at: Hhmm, recordedAt: z.string(),
    pod: z.object({
      receivedBy: z.string().trim().min(2).max(80), signed: z.boolean(), photos: z.number().int().min(0).max(20), photoIds: PhotoIds.optional(), lines: z.array(PodLine).max(50), note: z.string().max(500).optional(),
      code: Code.optional(), noCode: z.string().trim().max(200).optional(),
    }),
  }),
  z.object({
    id: Id, vehicleId: Id, kind: z.literal("problem"), orderId: Id, at: Hhmm, recordedAt: z.string(),
    problem: z.object({ reason: z.string().min(1).max(120), tempC: z.number().min(-40).max(80).optional(), note: z.string().max(500).optional() }),
  }),
]);

interface OpDef<S extends z.ZodType, R> {
  args: S;
  run: (d: Service["ops"], a: Actor, x: z.infer<S>) => R;
  audit: (x: z.infer<S>, r: R) => Pick<AuditEntry, "entity" | "entityId" | "summary">;
}
const op = <S extends z.ZodType, R>(d: OpDef<S, R>) => d;

/** Argument schema, rule call and audit line for each operation. */
const OPS = {
  placeOrder: op({
    args: z.object({ outletId: Id, temp: z.enum(["chilled", "ambient"]), lines: z.array(z.object({ skuId: Id, qty: z.number().int().min(1).max(10000) })).min(1).max(100) }),
    run: (d, a, x) => ops.placeOrder(d, a, x),
    audit: (x, r) => ({ entity: "order", entityId: r.id, summary: `Placed order ${r.id} for ${x.outletId} ${outletName(x.outletId)} (${r.units} units, ${r.temp})` }),
  }),
  closeOrdersAndPlan: op({
    args: z.object({ depot: Depot }),
    run: (d, a, x) => ops.closeOrdersAndPlan(d, a, x.depot),
    audit: (x, r) => ({ entity: "plan", entityId: x.depot, summary: `Closed orders and auto-planned ${x.depot}: ${r.trips.length} trips, ${r.deferred.length} deferred` }),
  }),
  replan: op({
    args: z.object({ depot: Depot }),
    run: (d, a, x) => ops.replan(d, a, x.depot),
    audit: (x, r) => ({ entity: "plan", entityId: x.depot, summary: `Re-ran the auto-plan for ${x.depot} (v${r.version})` }),
  }),
  moveOrder: op({
    args: z.object({
      depot: Depot,
      orderId: Id,
      target: z.union([
        z.object({ tripId: Id }),
        z.object({ newTripOn: Id }),
        z.object({ defer: z.literal(true), code: DeferralCode.optional(), note: z.string().max(300).optional() }),
      ]),
    }),
    run: (d, a, x) => ops.moveOrder(d, a, x.depot, x.orderId, x.target),
    audit: (x, r) => ({
      entity: "order", entityId: x.orderId,
      summary: r.ok
        ? "defer" in x.target ? `Deferred ${x.orderId}${x.target.note ? `: ${x.target.note}` : ""}` : `Moved ${x.orderId} to ${"tripId" in x.target ? x.target.tripId : `a new trip on ${x.target.newTripOn}`}`
        : `Move of ${x.orderId} refused: ${r.violations[0]?.message}`,
    }),
  }),
  publishPlan: op({
    args: z.object({ depot: Depot }),
    run: (d, a, x) => ops.publishPlan(d, a, x.depot),
    audit: (x, r) => ({ entity: "plan", entityId: x.depot, summary: `Published the ${x.depot} plan v${r.version} to loaders, drivers and stores` }),
  }),
  setVehicleStatus: op({
    args: z.object({ vehicleId: Id, status: z.enum(["available", "in_workshop"]) }),
    run: (d, a, x) => ops.setVehicleStatus(d, a, x.vehicleId, x.status),
    audit: (x) => ({ entity: "vehicle", entityId: x.vehicleId, summary: `${x.vehicleId} ${x.status === "available" ? "back in service" : "sent to the workshop"}` }),
  }),
  setLoadLine: op({
    args: z.object({ tripId: Id, key: z.string().min(3).max(120), loaded: z.number().int().min(0).max(100000) }),
    run: (d, a, x) => ops.setLoadLine(d, a, x.tripId, x.key, x.loaded),
    audit: (x) => ({ entity: "load", entityId: x.tripId, summary: `Loaded ${x.loaded} × ${x.key.split("|")[1]} (${x.key.split("|")[0]})` }),
  }),
  flagShortfall: op({
    args: z.object({ tripId: Id, orderId: Id, skuId: Id, loaded: z.number().int().min(0), kind: z.enum(["missing", "damaged", "wrong_item"]), decision: z.enum(["release", "hold"]), photo: z.boolean(), photoIds: PhotoIds.optional() }),
    run: (d, a, x) => ops.flagShortfall(d, a, x),
    audit: (_x, r) => ({ entity: "shortfall", entityId: r.id, summary: `Flagged ${r.kind.replace("_", " ")} ${r.name}: ${r.loaded} of ${r.planned} on ${r.vehicleId} (${r.decision === "hold" ? "vehicle held" : "released"})` }),
  }),
  releaseTrip: op({
    args: z.object({ tripId: Id }),
    run: (d, a, x) => ops.releaseTrip(d, a, x.tripId),
    audit: (x) => ({ entity: "load", entityId: x.tripId, summary: `Released trip ${x.tripId} from the dock` }),
  }),
  resolveShortfall: op({
    args: z.object({ id: Id, resolution: z.enum(["release", "repick", "tomorrow"]) }),
    run: (d, a, x) => ops.resolveShortfall(d, a, x.id, x.resolution),
    audit: (x) => ({ entity: "shortfall", entityId: x.id, summary: `Resolved a shortfall: ${x.resolution === "repick" ? "re-pick" : x.resolution === "tomorrow" ? "balance tomorrow" : "release with shortfall"}` }),
  }),
  syncDriverEvents: op({
    args: z.object({
      vehicleId: Id,
      events: z.array(Event).max(500),
      position: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracyM: z.number().min(0).max(100_000), at: Iso }).optional(),
      connectivity: z.array(z.object({ id: Id, state: z.enum(["offline", "online"]), at: Iso })).max(200).optional(),
      check: z.object({ syncedIds: z.array(Id).max(1000), queued: z.number().int().min(0), rejected: z.number().int().min(0), oldestQueuedAt: Iso.optional(), photosQueued: z.number().int().min(0).optional() }).optional(),
    }),
    run: (d, a, x) => ops.syncDriverEvents(d, a, x.vehicleId, x.events as DriverEvent[], { position: x.position, connectivity: x.connectivity, check: x.check } as SyncExtras),
    audit: (x, r) => ({ entity: "vehicle", entityId: x.vehicleId, summary: r.accepted.length ? `Synced ${r.accepted.length} driver record${r.accepted.length > 1 ? "s" : ""} from ${x.vehicleId}` : `Heartbeat from ${x.vehicleId}` }),
  }),
  ackNotice: op({
    args: z.object({ id: Id, response: z.enum(["ok", "reduce"]) }),
    run: (d, a, x) => ops.ackNotice(d, a, x.id, x.response),
    audit: (x) => ({ entity: "notice", entityId: x.id, summary: x.response === "ok" ? "Acknowledged a deferral notice" : "Asked to reduce the next order to essentials" }),
  }),
  confirmReceipt: op({
    args: z.object({
      orderId: Id,
      lines: z.array(z.object({ skuId: Id, name: z.string().max(120), driverQty: z.number().int().min(0), receivedQty: z.number().int().min(0), damagedQty: z.number().int().min(0).optional() })).max(50),
      issues: z.array(z.object({ type: z.string().min(1).max(60), note: z.string().max(500).optional() })).max(20),
      photoIds: PhotoIds.optional(),
    }),
    run: (d, a, x) => ops.confirmReceipt(d, a, x),
    audit: (x) => ({ entity: "order", entityId: x.orderId, summary: `Confirmed receipt of ${x.orderId}${x.issues.length ? ` with ${x.issues.length} issue${x.issues.length > 1 ? "s" : ""}` : ""}` }),
  }),
  resolveException: op({
    args: z.object({ id: Id }),
    run: (d, a, x) => ops.resolveException(d, a, x.id),
    audit: (x) => ({ entity: "exception", entityId: x.id, summary: "Marked an exception as handled" }),
  }),
};

const PLAN_OPS = new Set<string>(["closeOrdersAndPlan", "replan", "moveOrder", "publishPlan"]);

// Wrong delivery codes per order: a few tries, then the driver records the stop without a code.
const CODE_TRIES = 5;
const CODE_WINDOW_MS = 30 * 60_000;
const codeMisses = new Map<string, number[]>();

export const opsRoutes = new Hono<Env>()
  .use(requireAuth("dispatcher", "loader", "driver", "store"))
  .get("/snapshot", (c) => c.json({ db: visibleTo(c.var.svc.ops, actorOf(c.var.auth.user)), reference: reference() } satisfies Snapshot))
  .post("/checkCode", async (c) => {
    const x = await body(c, z.object({ orderId: Id, code: Code }));
    const now = Date.now();
    const misses = (codeMisses.get(x.orderId) ?? []).filter((t) => now - t < CODE_WINDOW_MS);
    if (misses.length >= CODE_TRIES)
      return c.json({ error: "Too many wrong codes for this stop. Record it without a code and call dispatch." }, 429);
    const ok = ops.checkCode(c.var.svc.ops, actorOf(c.var.auth.user), x.orderId, x.code);
    if (!ok) misses.push(now);
    codeMisses.set(x.orderId, misses);
    return c.json({ ok, attemptsLeft: CODE_TRIES - misses.length });
  })
  .post("/:name", async (c) => {
    const name = c.req.param("name") as keyof typeof OPS;
    const def = OPS[name] as OpDef<z.ZodType, unknown> | undefined;
    if (!def || !Object.hasOwn(OPS, name)) return c.json({ error: `Unknown operation “${name}”.` }, 404);
    const x = await body(c, def.args);
    const user = c.var.auth.user;
    const actor = actorOf(user);
    const svc = c.var.svc;
    const result = await svc.change(
      (r) => ({ userId: user.userId, actor: user.name, role: user.role, action: `ops.${name}`, ...def.audit(x, r) }),
      (d) => def.run(d, actor, x),
      name === "syncDriverEvents"
        ? {
            // Keep the raw device record next to its idempotency key.
            after: async (tx, r) => {
              const accepted = new Set((r as { accepted: string[] }).accepted);
              for (const e of (x as { events: DriverEvent[] }).events.filter((e) => accepted.has(e.id))) {
                await tx
                  .update(t.driverEvents)
                  .set({ vehicleId: e.vehicleId, orderId: e.orderId, kind: e.kind, deviceAt: e.at, recordedAt: e.recordedAt, userId: user.userId, payload: e })
                  .where(inArray(t.driverEvents.id, [e.id]));
              }
            },
          }
        : {},
    );
    // A changed plan changes the stops the Task 1 model scores (no-op without a model service).
    if (PLAN_OPS.has(name)) void refreshPredictions(svc);
    return c.json(result ?? { ok: true });
  });
