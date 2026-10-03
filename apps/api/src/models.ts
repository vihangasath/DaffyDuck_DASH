// Client for the Datathon model service (apps/models). The API sends it the day's planned stops and the
// forecast weeks in the same columns as the Datathon test files, keeps the latest answers in memory, and
// serves them with the reference data, where @waypoint/core picks them up (see core/predictions.ts).
// With no MODEL_URL, or when the service is down or has no model loaded, everything stays on baselines.
import { z } from "zod";
import { DEMO_DATE, contextFor, seed } from "@waypoint/core/reference";
import type { Db as OpsDb } from "@waypoint/core/contract";
import type { Reference } from "@waypoint/core/reference";
import { fmtMin } from "@waypoint/core/domain/time";
import { evaluateVehicle } from "@waypoint/core/planner/evaluate";
import { BASELINE_PREDICTIONS, type Predictions } from "@waypoint/core/predictions";
import { env } from "./env.ts";
import type { Service } from "./service.ts";

let current: Predictions = structuredClone(BASELINE_PREDICTIONS);
/** Task 2A answers by row id (`depot|brand|week`). */
let forecast = new Map<string, { totalM3: number; chilledM3: number }>();
let lastError: string | null = null;

/** Adds the latest model outputs to reference data loaded from the database. */
export function applyPredictions(ref: Reference): Reference {
  ref.predictions = current;
  if (forecast.size)
    ref.weeklyVolume = ref.weeklyVolume.map((w) => {
      const f = w.kind === "forecast" ? forecast.get(`${w.depot}|${w.brand}|${w.week}`) : undefined;
      return f ? { ...w, ...f } : w;
    });
  return ref;
}

export function modelStatus() {
  return { configured: !!env.modelUrl, url: env.modelUrl ?? null, lastError, task1: { ...current.task1, byOrder: undefined, orders: Object.keys(current.task1.byOrder).length }, task2a: current.task2a };
}

// ── Request rows: the Datathon test-file columns ──

/**
 * One row per planned stop: the task1_test_inputs.csv columns joined with the stop's route_legs_test.csv
 * leg, so the notebook's preprocessing runs unchanged on live plans.
 */
function task1Rows(ops: OpsDb) {
  const day = seed.calendar.find((c) => c.date === DEMO_DATE);
  const ctx = contextFor(ops.orders, ops.fleetStatus);
  const rows: Record<string, string | number>[] = [];
  for (const plan of Object.values(ops.plans)) {
    if (!plan) continue;
    for (const vid of new Set(plan.trips.map((t) => t.vehicleId))) {
      for (const te of evaluateVehicle(vid, plan.trips, ctx).trips) {
        const travel = ctx.net.travel.get(te.trip.district)!;
        te.stops.forEach((s, i) => {
          const order = ctx.orders.get(s.orderId)!;
          const outlet = ctx.net.outlets.get(s.outletId)!;
          const departAt = i === 0 ? te.depart : te.stops[i - 1].leave;
          rows.push({
            delivery_id: order.id,
            order_date: DEMO_DATE,
            dispatch_date: DEMO_DATE,
            dispatch_status: "attempted",
            outlet_id: outlet.id,
            brand: order.brand,
            district: outlet.district,
            depot: order.depot,
            temp_requirement: order.temp,
            order_units: order.units,
            order_weight_kg: order.weightKg,
            order_volume_m3: order.volumeM3,
            route_id: te.trip.id,
            seq_in_route: s.seq,
            vehicle_id: te.vehicle.id,
            vehicle_type: te.vehicle.type,
            vehicle_temp: te.vehicle.temp,
            planned_arrival_time: fmtMin(s.arrive),
            window_open_time: outlet.windowOpen,
            window_close_time: outlet.windowClose,
            from_point: i === 0 ? "DEPOT" : te.stops[i - 1].outletId,
            distance_km: i === 0 ? travel.depotToDistrictKm : travel.interStopKm,
            planned_depart_time: fmtMin(departAt),
            planned_travel_duration_min: Math.round(s.arrive - departAt),
            monsoon: day?.monsoon ? 1 : 0,
            dow: day?.dow ?? 0,
          });
        });
      }
    }
  }
  return rows;
}

/** One row per depot, brand and forecast week: the task2a_test_inputs.csv columns. */
function task2aRows() {
  const pairs = new Set(seed.weeklyVolume.filter((w) => w.kind === "forecast").map((w) => `${w.depot}|${w.brand}|${w.week}`));
  return [...pairs].map((row_id) => {
    const [depot, brand, week] = row_id.split("|");
    const [isoYear, isoWeek] = week.split("-W").map(Number);
    return { row_id, depot, brand, iso_year: isoYear, iso_week: isoWeek };
  });
}

// ── Responses ──

const Task1Answer = z.object({
  model: z.string().max(120).optional(),
  predictions: z.array(z.object({ delivery_id: z.string(), pred_service_min: z.number().finite().min(0).max(600), pred_late_prob: z.number().finite().min(0).max(1) })),
});
const Task2aAnswer = z.object({
  model: z.string().max(120).optional(),
  predictions: z.array(z.object({ row_id: z.string(), pred_total_volume_m3: z.number().finite().min(0), pred_chilled_volume_m3: z.number().finite().min(0) })),
});

/** POSTs rows to the model service. Returns null when no model answered (not configured, down, or 503 = no model file yet). */
async function ask<T extends z.ZodType>(path: string, rows: unknown[], schema: T): Promise<z.infer<T> | null> {
  if (!env.modelUrl || !rows.length) return null;
  try {
    const res = await fetch(`${env.modelUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rows }),
      signal: AbortSignal.timeout(env.modelTimeoutMs),
    });
    if (res.status === 503) return null; // the service is up but this model hasn't been added yet
    if (!res.ok) throw new Error(`${path} answered ${res.status}`);
    const parsed = schema.safeParse(await res.json());
    if (!parsed.success) throw new Error(`${path} answered in an unexpected shape: ${parsed.error.issues[0]?.message}`);
    return parsed.data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg !== lastError) console.warn(`Model service: ${msg}. Using baselines.`);
    lastError = msg;
    return null;
  }
}

let running: Promise<void> | null = null;
let again = false;

/**
 * Asks the model service for fresh predictions and republishes the reference data when they change.
 * Called at start-up and after every plan change; overlapping calls are coalesced into one more run.
 */
export function refreshPredictions(svc: Service): Promise<void> {
  const onBaselines = current.task1.source === "baseline" && current.task2a.source === "baseline";
  if (!env.modelUrl && onBaselines) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      lastError = null;
      const at = new Date().toISOString();
      const [t1, t2a] = await Promise.all([ask("/predict/task1", task1Rows(svc.ops), Task1Answer), ask("/forecast/task2a", task2aRows(), Task2aAnswer)]);
      current = {
        task1: t1
          ? { source: "model", model: t1.model, updatedAt: at, byOrder: Object.fromEntries(t1.predictions.map((p) => [p.delivery_id, { serviceMin: p.pred_service_min, lateProb: p.pred_late_prob }])) }
          : structuredClone(BASELINE_PREDICTIONS.task1),
        task2a: t2a ? { source: "model", model: t2a.model, updatedAt: at } : { source: "baseline" },
      };
      forecast = new Map(
        (t2a?.predictions ?? []).map((p) => [p.row_id, { totalM3: Math.round(p.pred_total_volume_m3 * 10) / 10, chilledM3: Math.round(p.pred_chilled_volume_m3 * 10) / 10 }]),
      );
      await svc.reloadReference();
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}
