// Datathon model outputs, as the planner and screens consume them. The API fills this from the model
// service (apps/models) when one is connected; until then every consumer falls back to a baseline, so
// the app behaves exactly as it does without models.
//
//   Task 1  pred_service_min  → handling time at each stop → every ETA (planner, loader, driver, store)
//   Task 1  pred_late_prob    → late-risk badges (dispatcher live tracking)
//   Task 2A pred_*_volume_m3  → forecast weeks on Capacity outlook (rows in weeklyVolume, kind "forecast")
import { toMin } from "./domain/time";
import type { Outlet } from "./domain/types";

/** "model" once a trained model has answered; "baseline" while the app uses its built-in rules. */
export type ModelSource = "model" | "baseline";

export interface ModelStatus {
  source: ModelSource;
  /** Model name and version as reported by the model service. */
  model?: string;
  /** When the predictions were last refreshed (ISO time). */
  updatedAt?: string;
}

export interface Predictions {
  task1: ModelStatus & {
    /** Keyed by order id (the Datathon `delivery_id`). Orders without an entry use the baseline. */
    byOrder: Record<string, { serviceMin: number; lateProb: number }>;
  };
  task2a: ModelStatus;
}

export const BASELINE_PREDICTIONS: Predictions = {
  task1: { source: "baseline", byOrder: {} },
  task2a: { source: "baseline" },
};

/**
 * Baseline late risk until the Task 1 lateness model is connected: 0 until the ETA is within 40 minutes
 * of the window closing, rising to 0.95 at the close.
 */
export function baselineLateRisk(arrive: number, outlet: Outlet): number {
  return Math.max(0, Math.min(0.95, (arrive - (toMin(outlet.windowClose) - 40)) / 40));
}
