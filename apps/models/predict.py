"""Datathon models behind the Waypoint API. PLACEHOLDERS: drop the trained files into artifacts/.

Each task has a loader and a predict function. A loader returns None until its files exist, and the
server then answers 503, so the API keeps using its baselines. Request rows use the same columns as the
Datathon test files, so the notebook's preprocessing can be copied in unchanged.

  Task 1  rows = task1_test_inputs.csv columns + the stop's route_legs_test.csv leg columns
          → pred_service_min, pred_late_prob   (per delivery_id)
  Task 2A rows = task2a_test_inputs.csv columns (row_id, depot, brand, iso_year, iso_week)
          → pred_total_volume_m3, pred_chilled_volume_m3   (per row_id)
"""

from __future__ import annotations

import os
from pathlib import Path

ARTIFACTS = Path(os.environ.get("MODEL_DIR", Path(__file__).parent / "artifacts"))

# File names the loaders look for. Rename here if your notebook saves them differently.
TASK1_SERVICE = "task1_service.joblib"  # regressor   → pred_service_min
TASK1_LATE = "task1_late.joblib"  # classifier  → pred_late_prob (predict_proba[:, 1])
TASK2A_FORECAST = "task2a_forecast.joblib"  # forecaster  → total and chilled m³


def _files(*names: str) -> list[Path] | None:
    paths = [ARTIFACTS / n for n in names]
    return paths if all(p.exists() for p in paths) else None


# ── Task 1: service time and lateness ──────────────────────────────────────────────────────────────


def task1_features(df):
    """TODO: the notebook's Task 1 feature pipeline.

    If the saved models are full scikit-learn Pipelines (preprocessing included), return df unchanged.
    Otherwise build the same feature columns the models were trained on, from these request columns:
    delivery_id, order_date, dispatch_date, dispatch_status, outlet_id, brand, district, depot,
    temp_requirement, order_units, order_weight_kg, order_volume_m3, route_id, seq_in_route, vehicle_id,
    vehicle_type, vehicle_temp, planned_arrival_time, window_open_time, window_close_time, from_point,
    distance_km, planned_depart_time, planned_travel_duration_min, monsoon, dow.
    """
    return df


def load_task1():
    files = _files(TASK1_SERVICE, TASK1_LATE)
    if not files:
        return None
    import joblib
    import pandas as pd

    service_model, late_model = (joblib.load(p) for p in files)

    def predict(rows: list[dict]) -> list[dict]:
        df = pd.DataFrame(rows)
        X = task1_features(df)
        service = service_model.predict(X)
        late = late_model.predict_proba(X)[:, 1]
        return [
            {"delivery_id": d, "pred_service_min": max(0.0, float(s)), "pred_late_prob": min(1.0, max(0.0, float(p)))}
            for d, s, p in zip(df["delivery_id"], service, late)
        ]

    return predict


# ── Task 2A: weekly depot demand ───────────────────────────────────────────────────────────────────


def task2a_features(df):
    """TODO: the notebook's Task 2A feature pipeline (calendar features, lags, etc.).

    Request columns: row_id, depot, brand, iso_year, iso_week. Return df unchanged if the saved model
    builds its own features.
    """
    return df


def load_task2a():
    files = _files(TASK2A_FORECAST)
    if not files:
        return None
    import joblib
    import pandas as pd

    model = joblib.load(files[0])

    def predict(rows: list[dict]) -> list[dict]:
        df = pd.DataFrame(rows)
        # TODO: match your model's output. Assumed here: predict() returns [total_m3, chilled_m3] per row.
        out = model.predict(task2a_features(df))
        return [
            {
                "row_id": r,
                "pred_total_volume_m3": max(0.0, float(total)),
                # Only Fresh has chilled demand (brief, Task 2A).
                "pred_chilled_volume_m3": max(0.0, float(chilled)) if brand == "Fresh" else 0.0,
            }
            for r, brand, (total, chilled) in zip(df["row_id"], df["brand"], out)
        ]

    return predict


# Name and version reported to the API and shown on the dispatcher screens.
MODEL_NAME = os.environ.get("MODEL_NAME", "datathon")
