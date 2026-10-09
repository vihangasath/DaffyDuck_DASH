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
from typing import Any

ARTIFACTS = Path(os.environ.get("MODEL_DIR", Path(__file__).parent / "artifacts"))

# File names the loaders look for. Rename here if your notebook saves them differently.
TASK1_SERVICE_CANDIDATES = ["task1_service_model.cbm", "task1_service.cbm", "task1_service.joblib"]
TASK1_LATE_CANDIDATES = ["task1_late_model.cbm", "task1_late.cbm", "task1_late.joblib"]
TASK2A_FORECAST = "task2a_forecast.joblib"  # forecaster  → total and chilled m³
TASK2B_SUBMISSION = "submission_task2b.csv"  # peak-day fleet allocation


def _find_candidate(names: list[str] | str) -> Path | None:
    if isinstance(names, str):
        names = [names]
    for n in names:
        p = ARTIFACTS / n
        if p.exists():
            return p
    return None


def _files(*name_groups: list[str] | str) -> list[Path] | None:
    found: list[Path] = []
    for g in name_groups:
        p = _find_candidate(g)
        if p is None:
            return None
        found.append(p)
    return found


# ── Task 1: service time and lateness ──────────────────────────────────────────────────────────────

TASK1_CATEGORICAL_FEATURES = [
    "outlet_id", "brand", "district", "depot", "temp_requirement",
    "dispatch_status", "vehicle_id", "vehicle_type", "vehicle_temp",
    "dock_type", "parking_constraint", "fuel_type", "road_class",
    "from_point", "festival", "dow_name",
]

TASK1_NUMERICAL_FEATURES = [
    "order_units", "order_weight_kg", "order_volume_m3", "seq_in_route",
    "distance_km", "planned_travel_duration_min", "planned_depart_min",
    "planned_depart_hour", "planned_arrival_min", "window_open_min",
    "window_close_min", "planned_slack_min", "planned_early_gap_min",
    "window_width_min", "weight_per_unit", "volume_per_unit", "density_kg_m3",
    "weight_cap_kg", "volume_cap_m3", "weight_utilisation", "volume_utilisation",
    "service_allowance_min", "free_flow_kmh", "depot_to_district_km",
    "depot_to_district_freeflow_min", "inter_stop_km", "inter_stop_freeflow_min",
    "speed_index", "disruption_index", "traffic_factor", "disruption_factor",
    "traffic_adjusted_leg_min", "traffic_road_adjusted_leg_min", "dow",
    "monsoon", "is_weekend", "is_payday", "festival_ramp", "is_holiday",
    "is_operating", "dispatch_delay_days", "month", "day_of_month",
    "week_of_year", "route_n_stops", "route_progress", "route_total_distance_km",
    "route_total_planned_travel_min", "route_total_service_allowance_min",
    "cum_distance_to_stop_km", "cum_planned_travel_to_stop_min",
    "planned_service_before_min", "planned_route_work_to_arrival_min",
    "is_first_stop", "stops_before",
]

TASK1_FEATURES = TASK1_CATEGORICAL_FEATURES + TASK1_NUMERICAL_FEATURES

_task1_ref_cache: dict[str, Any] | None = None


def _get_task1_reference():
    global _task1_ref_cache
    if _task1_ref_cache is not None:
        return _task1_ref_cache
    import pandas as pd
    ref_joblib = ARTIFACTS / "task1_reference.joblib"
    if ref_joblib.exists():
        import joblib
        raw = joblib.load(ref_joblib)
        cal = raw["calendar"].copy()
        cal["date"] = pd.to_datetime(cal["date"], errors="coerce")
        rc = raw["road_conditions"].copy()
        rc["date"] = pd.to_datetime(rc["date"], errors="coerce")
        _task1_ref_cache = {
            "outlets": raw["outlets"][["outlet_id", "dock_type", "parking_constraint", "mall_window"]].copy(),
            "vehicles": raw["vehicles"][["vehicle_id", "weight_cap_kg", "volume_cap_m3", "fuel_type", "km_per_l", "weekly_fuel_quota_l"]].copy(),
            "district_travel": raw["district_travel"].copy(),
            "service_allowance": raw["service_allowance"].copy(),
            "calendar": cal[["date", "dow_name", "is_weekend", "iso_year", "iso_week", "is_payday", "festival", "festival_ramp", "is_holiday", "is_operating"]].copy(),
            "road_conditions": rc.copy(),
            "traffic_speed": raw["traffic_speed"].copy(),
        }
        return _task1_ref_cache

    seed_path = Path(__file__).parent.parent.parent / "packages" / "core" / "src" / "seed.json"
    if seed_path.exists():
        import json
        with open(seed_path, encoding="utf-8") as f:
            seed = json.load(f)
        outlets = pd.DataFrame([
            {"outlet_id": o["id"], "dock_type": o.get("dockType"), "parking_constraint": o.get("parking"), "mall_window": o.get("mallWindow")}
            for o in seed.get("outlets", [])
        ])
        vehicles = pd.DataFrame([
            {"vehicle_id": v["id"], "weight_cap_kg": v.get("weightCapKg"), "volume_cap_m3": v.get("volumeCapM3"), "fuel_type": v.get("fuelType"), "km_per_l": v.get("kmPerL"), "weekly_fuel_quota_l": v.get("weeklyFuelQuotaL")}
            for v in seed.get("vehicles", [])
        ])
        district_travel = pd.DataFrame([
            {"district": d["district"], "depot": d["depot"], "road_class": d.get("roadClass"), "free_flow_kmh": d.get("freeFlowKmh"), "depot_to_district_km": d.get("depotToDistrictKm"), "depot_to_district_freeflow_min": d.get("depotToDistrictMin"), "inter_stop_km": d.get("interStopKm"), "inter_stop_freeflow_min": d.get("interStopMin")}
            for d in seed.get("districtTravel", [])
        ])
        service_allowance = pd.DataFrame([
            {"brand": s["brand"], "dock_type": s["dockType"], "service_allowance_min": s["minutes"]}
            for s in seed.get("serviceAllowance", [])
        ])
        cal = pd.DataFrame(seed.get("calendar", []))
        if not cal.empty:
            cal["date"] = pd.to_datetime(cal["date"], errors="coerce")
            cal["dow_name"] = cal["date"].dt.strftime("%a")
            cal["is_weekend"] = cal.get("dow", 0).isin([5, 6]).astype(int)
            cal["is_payday"] = cal.get("payday", False).astype(int)
            cal["is_holiday"] = cal.get("holiday", False).astype(int)
            cal["is_operating"] = cal.get("operating", True).astype(int)
        rc = pd.DataFrame(seed.get("roadConditions", []))
        if not rc.empty:
            rc["date"] = pd.to_datetime("2025-12-18")
            rc = rc.rename(columns={"disruptionIndex": "disruption_index"})
        _task1_ref_cache = {
            "outlets": outlets,
            "vehicles": vehicles,
            "district_travel": district_travel,
            "service_allowance": service_allowance,
            "calendar": cal,
            "road_conditions": rc,
            "traffic_speed": pd.DataFrame(columns=["district", "hour", "monsoon", "speed_index"]),
        }
        return _task1_ref_cache
    return None


def _time_to_minutes(series):
    import pandas as pd
    if series is None or len(series) == 0:
        return pd.Series(dtype=float)
    if pd.api.types.is_numeric_dtype(series):
        return pd.to_numeric(series, errors="coerce").astype(float)
    parts = series.astype("string").str.split(":", n=1, expand=True)
    if parts.shape[1] < 2:
        return pd.to_numeric(parts[0], errors="coerce").astype(float)
    return (pd.to_numeric(parts[0], errors="coerce") * 60 + pd.to_numeric(parts[1], errors="coerce")).astype(float)


def task1_features(df):
    """Build the exact 71 features expected by the Task 1 CatBoost models."""
    import numpy as np
    import pandas as pd

    if df.empty:
        return pd.DataFrame(columns=TASK1_FEATURES)

    ref = _get_task1_reference()
    out = df.copy()

    # Normalize dates
    if "date" not in out.columns:
        date_src = out["dispatch_date"] if "dispatch_date" in out.columns else out.get("order_date")
        out["date"] = pd.to_datetime(date_src, errors="coerce")
    else:
        out["date"] = pd.to_datetime(out["date"], errors="coerce")

    if "order_date" in out.columns:
        out["order_date"] = pd.to_datetime(out["order_date"], errors="coerce")
    else:
        out["order_date"] = out["date"]

    if "dispatch_date" in out.columns:
        out["dispatch_date"] = pd.to_datetime(out["dispatch_date"], errors="coerce")
    else:
        out["dispatch_date"] = out["date"]

    if ref:
        for ref_table, l_on, r_on in [
            (ref["outlets"], ["outlet_id"], ["outlet_id"]),
            (ref["vehicles"], ["vehicle_id"], ["vehicle_id"]),
            (ref["district_travel"], ["district", "depot"], ["district", "depot"]),
            (ref["service_allowance"], ["brand", "dock_type"], ["brand", "dock_type"]),
            (ref["calendar"], ["date"], ["date"]),
            (ref["road_conditions"], ["district", "date"], ["district", "date"]),
        ]:
            if ref_table is not None and not ref_table.empty:
                drop_existing = [c for c in ref_table.columns if c in out.columns and c not in l_on and c not in r_on]
                if drop_existing:
                    out = out.drop(columns=drop_existing)
                out = out.merge(ref_table, left_on=l_on, right_on=r_on, how="left")

        out["planned_depart_min"] = _time_to_minutes(out["planned_depart_time"])
        out["planned_depart_hour"] = (out["planned_depart_min"] // 60).fillna(6).astype(int)

        traffic = ref["traffic_speed"]
        if traffic is not None and not traffic.empty:
            if "monsoon" not in out.columns:
                out["monsoon"] = 0
            out["monsoon_int"] = pd.to_numeric(out["monsoon"], errors="coerce").fillna(0).astype(int)
            drop_traffic = [c for c in ["speed_index"] if c in out.columns]
            if drop_traffic:
                out = out.drop(columns=drop_traffic)
            out = out.merge(
                traffic,
                left_on=["district", "planned_depart_hour", "monsoon_int"],
                right_on=["district", "hour", "monsoon"],
                how="left",
                suffixes=("", "_traf"),
            )
            out = out.drop(columns=["monsoon_int"], errors="ignore")

    # Time windows
    out["window_open_min"] = _time_to_minutes(out["window_open_time"])
    out["window_close_min"] = _time_to_minutes(out["window_close_time"])
    out["planned_arrival_min"] = _time_to_minutes(out["planned_arrival_time"])
    if "planned_depart_min" not in out.columns or out["planned_depart_min"].isna().all():
        out["planned_depart_min"] = _time_to_minutes(out["planned_depart_time"])
    if "planned_depart_hour" not in out.columns:
        out["planned_depart_hour"] = (out["planned_depart_min"] // 60).fillna(6).astype(int)

    out["planned_slack_min"] = out["window_close_min"] - out["planned_arrival_min"]
    out["planned_early_gap_min"] = out["window_open_min"] - out["planned_arrival_min"]
    out["window_width_min"] = out["window_close_min"] - out["window_open_min"]

    def safe_div(num, den):
        n = pd.to_numeric(num, errors="coerce")
        d = pd.to_numeric(den, errors="coerce").replace(0, np.nan)
        return n / d

    out["weight_per_unit"] = safe_div(out["order_weight_kg"], out["order_units"])
    out["volume_per_unit"] = safe_div(out["order_volume_m3"], out["order_units"])
    out["density_kg_m3"] = safe_div(out["order_weight_kg"], out["order_volume_m3"])

    out["weight_utilisation"] = safe_div(out["order_weight_kg"], out.get("weight_cap_kg", 5000))
    out["volume_utilisation"] = safe_div(out["order_volume_m3"], out.get("volume_cap_m3", 25))

    out["dispatch_delay_days"] = (out["dispatch_date"] - out["order_date"]).dt.days.fillna(0)
    out["month"] = out["date"].dt.month.fillna(12).astype(int)
    out["day_of_month"] = out["date"].dt.day.fillna(18).astype(int)
    out["week_of_year"] = out["date"].dt.isocalendar().week.fillna(51).astype(int)

    speed_idx = pd.to_numeric(out.get("speed_index", 100), errors="coerce").fillna(100).replace(0, 100)
    disrupt_idx = pd.to_numeric(out.get("disruption_index", 100), errors="coerce").fillna(100).replace(0, 100)
    out["speed_index"] = speed_idx
    out["disruption_index"] = disrupt_idx
    out["traffic_factor"] = 100.0 / speed_idx
    out["disruption_factor"] = 100.0 / disrupt_idx

    travel_dur = pd.to_numeric(out.get("planned_travel_duration_min", 20), errors="coerce").fillna(20)
    out["planned_travel_duration_min"] = travel_dur
    out["traffic_adjusted_leg_min"] = travel_dur * out["traffic_factor"]
    out["traffic_road_adjusted_leg_min"] = travel_dur * out["traffic_factor"] * out["disruption_factor"]

    out["_orig_idx"] = np.arange(len(out))
    route_col = "route_id" if "route_id" in out.columns else "_orig_idx"
    seq_col = "seq_in_route" if "seq_in_route" in out.columns else "_orig_idx"
    out = out.sort_values([route_col, seq_col]).copy()
    grp = out.groupby(route_col, sort=False)

    srv_allow = pd.to_numeric(out.get("service_allowance_min", 20), errors="coerce").fillna(20)
    out["service_allowance_min"] = srv_allow
    dist_km = pd.to_numeric(out.get("distance_km", 10), errors="coerce").fillna(10)
    out["distance_km"] = dist_km

    out["route_n_stops"] = grp["delivery_id"].transform("size")
    seq_num = pd.to_numeric(out[seq_col], errors="coerce").fillna(0)
    out["seq_in_route"] = seq_num
    out["route_progress"] = (seq_num + 1) / out["route_n_stops"]
    out["route_total_distance_km"] = grp[dist_km.name].transform("sum")
    out["route_total_planned_travel_min"] = grp[travel_dur.name].transform("sum")
    out["route_total_service_allowance_min"] = grp[srv_allow.name].transform("sum")
    out["cum_distance_to_stop_km"] = grp[dist_km.name].cumsum()
    out["cum_planned_travel_to_stop_min"] = grp[travel_dur.name].cumsum()
    out["planned_service_before_min"] = grp[srv_allow.name].cumsum() - srv_allow
    out["planned_route_work_to_arrival_min"] = out["cum_planned_travel_to_stop_min"] + out["planned_service_before_min"]
    out["is_first_stop"] = (seq_num == 0).astype(int)
    out["stops_before"] = seq_num.astype(float)

    out = out.sort_values("_orig_idx").drop(columns="_orig_idx").reset_index(drop=True)

    for col in TASK1_CATEGORICAL_FEATURES:
        if col not in out.columns:
            out[col] = "Unknown"
        else:
            out[col] = out[col].fillna("Unknown").astype(str).str.strip()

    for col in TASK1_NUMERICAL_FEATURES:
        if col not in out.columns:
            out[col] = np.nan
        else:
            out[col] = pd.to_numeric(out[col], errors="coerce")

    out[TASK1_NUMERICAL_FEATURES] = out[TASK1_NUMERICAL_FEATURES].replace([np.inf, -np.inf], np.nan)
    return out[TASK1_FEATURES]


def load_task1():
    files = _files(TASK1_SERVICE_CANDIDATES, TASK1_LATE_CANDIDATES)
    if not files:
        return None
    service_path, late_path = files

    if str(service_path).endswith(".cbm"):
        from catboost import CatBoostRegressor, CatBoostClassifier
        service_model = CatBoostRegressor()
        service_model.load_model(str(service_path))
        late_model = CatBoostClassifier()
        late_model.load_model(str(late_path))
    else:
        import joblib
        service_model = joblib.load(service_path)
        late_model = joblib.load(late_path)

    import pandas as pd

    def predict(rows: list[dict]) -> list[dict]:
        if not rows:
            return []
        df = pd.DataFrame(rows)
        X = task1_features(df)
        service = service_model.predict(X)
        late_probs = late_model.predict_proba(X)
        late = late_probs[:, 1] if getattr(late_probs, "ndim", 1) == 2 and late_probs.shape[1] > 1 else late_probs
        return [
            {
                "delivery_id": str(d),
                "pred_service_min": round(max(0.0, min(600.0, float(s))), 2),
                "pred_late_prob": round(max(0.0, min(1.0, float(p))), 6),
            }
            for d, s, p in zip(df["delivery_id"], service, late)
        ]

    return predict


def load_task2b():
    path = ARTIFACTS / TASK2B_SUBMISSION
    if not path.exists():
        return None
    import pandas as pd
    df = pd.read_csv(path)
    lookup = {str(r.order_ref): r._asdict() for r in df.itertuples(index=False)}

    def query(rows: list[dict]) -> list[dict]:
        results = []
        for r in rows:
            ref = str(r.get("order_ref", r.get("orderId", r.get("id", ""))))
            dec = lookup.get(ref, {})
            results.append({
                "order_ref": ref,
                "decision": dec.get("decision", "served"),
                "vehicle_id": dec.get("vehicle_id", None),
                "trip_id": dec.get("trip_id", None),
            })
        return results

    return query


# ── Task 2A: weekly depot demand ───────────────────────────────────────────────────────────────────

CAL_FEATURES = ['operating', 'payday', 'festival_ramp', 'holiday', 'monsoon', 'festival_days']
SPECS_TASK2A = {
    'naive': {}, 'moving_average': {}, 'seasonal_naive': {}, 'trend_average': {},
    'ridge_basic': {'kind': 'ridge', 'alpha': 10, 'enhanced': False},
    'ridge_10': {'kind': 'ridge', 'alpha': 10}, 'ridge_100': {'kind': 'ridge', 'alpha': 100},
    'random_forest': {'kind': 'rf'}, 'hist_gradient': {'kind': 'hist'},
    'catboost_depth4': {'kind': 'cat', 'depth': 4}, 'catboost_depth6': {'kind': 'cat', 'depth': 6},
    'lightgbm_15': {'kind': 'lgb', 'leaves': 15}, 'lightgbm_7': {'kind': 'lgb', 'leaves': 7},
    'ridge_recursive': {'kind': 'ridge', 'alpha': 100, 'recursive': True},
    'ridge_by_brand': {'kind': 'ridge', 'alpha': 100, 'by_brand': True},
    'ridge_chilled_share': {'kind': 'ridge', 'alpha': 100, 'share': True}
}


def _make_row_task2a(values, outlets, origin, target, calendar, depot, brand, enhanced=True):
    import numpy as np
    history = np.asarray(values[:origin + 1], dtype=float)
    scale = max(history[-13:].mean(), 1e-6)
    c = calendar.iloc[target]
    row = {
        'horizon': target - origin,
        'trend_time': target / 52,
        'depot_Kandy': int(depot == 'Kandy'),
        'brand_Fresh': int(brand == 'Fresh'),
        'brand_Style': int(brand == 'Style'),
    }
    for lag in [0, 1, 2, 3, 7, 12, 25]:
        row[f'lag_{lag}'] = history[-1 - lag] / scale
    for window in [4, 13, 26]:
        row[f'mean_{window}'] = history[-window:].mean() / scale
        row[f'std_{window}'] = history[-window:].std() / scale
    row['recent_trend'] = (history[-4:].mean() - history[-13:].mean()) / scale
    row['seasonal_lag'] = values[target - 52] / scale if 0 <= target - 52 <= origin else 1.0
    row['seasonal_available'] = int(0 <= target - 52 <= origin)
    for name in CAL_FEATURES:
        row[name] = float(c[name])
    for harmonic in range(1, 4 if enhanced else 2):
        for fn, func in [('sin', np.sin), ('cos', np.cos)]:
            row[f'{fn}_{harmonic}'] = func(2 * np.pi * harmonic * float(c.iso_week) / 52.1775)
    if enhanced:
        row['ramp_next'] = float(calendar.iloc[min(target + 1, len(calendar) - 1)].festival_ramp)
        row['ramp_previous'] = float(calendar.iloc[max(target - 1, 0)].festival_ramp)
        row['outlets_recent'] = float(np.mean(outlets[max(0, origin - 3):origin + 1]))
        row['outlets_change'] = row['outlets_recent'] / max(float(np.mean(outlets[max(0, origin - 12):origin + 1])), 1)
        for name in CAL_FEATURES + ['seasonal_lag', 'recent_trend']:
            for b in ['Fresh', 'Style', 'Tech']:
                row[f'{name}_{b}'] = row[name] * int(brand == b)
    return row, scale


def _predict_bundle_task2a(bundle, series, calendar, origin, horizons=10, total_predictions=None):
    import numpy as np
    import pandas as pd
    name, target = bundle['name'], bundle['target']
    spec = SPECS_TASK2A[name]
    results = []
    for (depot, brand), frame in series.items():
        if target == 'chilled' and brand != 'Fresh':
            continue
        v = frame[target].to_numpy()[:origin + 1].tolist()
        if bundle.get('share'):
            v = (frame.chilled / np.maximum(frame.total, 1e-6)).to_numpy()[:origin + 1].tolist()
        outlets = frame.outlet_count.to_numpy()[:origin + 1]
        for h in range(1, horizons + 1):
            t = origin + h
            if name == 'naive':
                p = v[-1]
            elif name == 'moving_average':
                p = np.mean(v[-4:])
            elif name == 'seasonal_naive':
                p = v[t - 52] if t >= 52 else np.mean(v[-4:])
            elif name == 'trend_average':
                p = np.mean(v[-4:]) + h * (np.mean(v[-4:]) - np.mean(v[-13:])) / 9
            else:
                recursive = spec.get('recursive', False)
                effective_origin = t - 1 if recursive else origin
                padded_outlets = np.pad(outlets, (0, max(0, effective_origin + 1 - len(outlets))), mode='edge')
                row, scale = _make_row_task2a(v, padded_outlets, effective_origin, t, calendar, depot, brand, spec.get('enhanced', True))
                model = bundle['models'].get(brand, bundle['models'].get('all'))
                p = float(model.predict(pd.DataFrame([row])[bundle['columns']])[0]) * scale
                if recursive:
                    v.append(max(0, p))
                if bundle.get('share'):
                    p = np.clip(p, 0, 1) * total_predictions[(depot, brand, h)]
            results.append({'depot': depot, 'brand': brand, 'horizon': h, 'week_start': calendar.iloc[t].week_start, 'target': target, 'predicted': max(0.0, p)})
    return pd.DataFrame(results)


def _infer_artifact_task2a(artifact, inputs_df):
    import numpy as np
    import pandas as pd
    predictions = {}
    for target, selection in artifact['selection'].items():
        frames = []
        for name in selection:
            frames.append(_predict_bundle_task2a(artifact['bundles'][target][name], artifact['series'], artifact['calendar'], artifact['origin'], total_predictions=predictions.get('lookup')))
        p = frames[0].copy()
        p['predicted'] = np.mean([f.predicted.to_numpy() for f in frames], axis=0)
        predictions[target] = p
        if target == 'total':
            predictions['lookup'] = {(r.depot, r.brand, r.horizon): r.predicted for r in p.itertuples()}
    total = predictions['total'].rename(columns={'predicted': 'pred_total_volume_m3'})
    chilled = predictions['chilled'].rename(columns={'predicted': 'pred_chilled_volume_m3'})
    merged = total.merge(chilled[['week_start', 'depot', 'brand', 'pred_chilled_volume_m3']], on=['week_start', 'depot', 'brand'], how='left')
    merged['pred_chilled_volume_m3'] = merged.pred_chilled_volume_m3.fillna(0).clip(lower=0, upper=merged.pred_total_volume_m3)
    merged = merged.merge(artifact['calendar'][['week_start', 'iso_year', 'iso_week']], on='week_start', validate='many_to_one')
    keys = ['depot', 'brand', 'iso_year', 'iso_week']
    result = inputs_df.merge(merged[keys + ['pred_total_volume_m3', 'pred_chilled_volume_m3']], on=keys, how='left', validate='one_to_one', sort=False)
    return result


def task2a_features(df):
    """Task 2A feature helper for generic scikit-learn models."""
    return df


def load_task2a():
    files = _files(TASK2A_FORECAST)
    if not files:
        return None
    import joblib
    import pandas as pd

    artifact = joblib.load(files[0])

    if isinstance(artifact, dict) and "selection" in artifact:
        cal = artifact.get("calendar")

        def predict_task2a(rows: list[dict]) -> list[dict]:
            df = pd.DataFrame(rows)
            m = df.merge(cal[["iso_year", "iso_week"]].reset_index(), on=["iso_year", "iso_week"], how="left")
            df["_cal_idx"] = m["index"]

            results = []
            is_future = df["_cal_idx"] > artifact["origin"]
            for mask in [~is_future, is_future]:
                sub = df[mask].copy()
                if sub.empty:
                    continue
                min_idx = int(sub["_cal_idx"].min())
                max_idx = int(sub["_cal_idx"].max())
                origin = artifact["origin"] if min_idx >= artifact["origin"] + 1 else max(26, min_idx - 1)
                horizons = max(10, max_idx - origin)
                art = dict(artifact)
                art["origin"] = origin
                art["series"] = {k: f.iloc[:origin + 1].copy() for k, f in artifact["series"].items()}
                res = _infer_artifact_task2a(art, sub.drop(columns=["_cal_idx"]))
                results.append(res)

            full = pd.concat(results, ignore_index=True) if results else df
            out = df[["row_id"]].merge(full, on="row_id", how="left")
            return [
                {
                    "row_id": str(r.row_id),
                    "pred_total_volume_m3": round(max(0.0, float(getattr(r, "pred_total_volume_m3", 0.0))), 2),
                    "pred_chilled_volume_m3": round(max(0.0, float(getattr(r, "pred_chilled_volume_m3", 0.0))), 2) if getattr(r, "brand", None) == "Fresh" else 0.0,
                }
                for r in out.itertuples()
            ]

        return predict_task2a

    def predict_generic(rows: list[dict]) -> list[dict]:
        df = pd.DataFrame(rows)
        out = artifact.predict(task2a_features(df))
        return [
            {
                "row_id": str(r),
                "pred_total_volume_m3": max(0.0, float(total)),
                "pred_chilled_volume_m3": max(0.0, float(chilled)) if brand == "Fresh" else 0.0,
            }
            for r, brand, (total, chilled) in zip(df["row_id"], df["brand"], out)
        ]

    return predict_generic


# Name and version reported to the API and shown on the dispatcher screens.
MODEL_NAME = os.environ.get("MODEL_NAME", "datathon")
