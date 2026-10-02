// Datathon model status, refresh, and the weekly forecast for Capacity outlook (dispatchers).
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, type Env } from "../http.ts";
import { modelStatus, refreshPredictions } from "../models.ts";
import { reference } from "../reference.ts";

const ForecastQuery = z.object({
  depot: z.enum(["Peliyagoda", "Kandy"]).optional(),
  weeks: z.coerce.number().int().min(1).max(52).optional(),
});

const dispatcher = requireAuth("dispatcher");

export const modelRoutes = new Hono<Env>()
  /** Which models are connected, which are on baselines, and the last problem reaching the service. */
  .get("/models", dispatcher, (c) => c.json(modelStatus()))
  /** Asks the model service again now (e.g. right after adding a model file). */
  .post("/models/refresh", dispatcher, async (c) => {
    await refreshPredictions(c.var.svc);
    return c.json(modelStatus());
  })
  /** Task 2A: forecast volume per depot, brand and week (pred_total_volume_m3, pred_chilled_volume_m3). */
  .get("/forecast", dispatcher, (c) => {
    const q = ForecastQuery.safeParse(c.req.query());
    if (!q.success) return c.json({ error: "Use ?depot=Peliyagoda|Kandy&weeks=1–52." }, 400);
    const ref = reference();
    const weeks = ref.meta.futureWeeks.map((w) => w.week).slice(0, q.data.weeks);
    const rows = ref.weeklyVolume.filter((w) => w.kind === "forecast" && weeks.includes(w.week) && (!q.data.depot || w.depot === q.data.depot));
    return c.json({
      source: ref.predictions?.task2a.source ?? "baseline",
      model: ref.predictions?.task2a.model ?? null,
      rows: rows.map((w) => ({ depot: w.depot, brand: w.brand, week: w.week, pred_total_volume_m3: w.totalM3, pred_chilled_volume_m3: w.chilledM3 })),
    });
  });
