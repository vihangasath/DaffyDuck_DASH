# Model files go here

Drop the trained Datathon models in this folder. Each task switches from its baseline to the model as soon as its files are here; the service doesn't need a restart.

| File | Task | Used for |
|---|---|---|
| `task1_service_model.cbm` | Task 1 regressor → `pred_service_min` | Handling time at each stop, which moves every ETA (planner, loader, driver, store) |
| `task1_late_model.cbm` | Task 1 classifier → `pred_late_prob` | Late-risk badges on dispatcher Live tracking |
| `task1_reference.joblib` | Task 1 reference tables | Network, calendar, travel and traffic indices for zero-leakage feature generation |
| `task2a_forecast.joblib` | Task 2A forecaster → total and chilled m³ | Multi-horizon forecast weeks on Capacity outlook |
| `submission_task2b.csv` | Task 2B allocation decisions | Peak-day scenario (S1) fleet allocation decisions and trip definitions |
| `task2b_prioritization_policy.md` | Task 2B policy document | Mathematical prioritization framework & dual-trip policy for extreme peak days |

The loaders in `../predict.py` detect both CatBoost `.cbm` models and scikit-learn `.joblib` pipelines.

These files are git-ignored: they are derived from the competition datasets, which the terms say must not be published.
