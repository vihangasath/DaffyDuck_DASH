# Model files go here

Drop the trained Datathon models in this folder. Each task switches from its baseline to the model as soon as its files are here; the service doesn't need a restart.

| File | Task | Used for |
|---|---|---|
| `task1_service.joblib` | Task 1 regressor → `pred_service_min` | Handling time at each stop, which moves every ETA (planner, loader, driver, store) |
| `task1_late.joblib` | Task 1 classifier → `pred_late_prob` | Late-risk badges on dispatcher Live tracking |
| `task2a_forecast.joblib` | Task 2A forecaster → total and chilled m³ | Forecast weeks on Capacity outlook |

Change the names in `../predict.py` if your notebook saves them differently, and fill in its `task1_features` and `task2a_features` unless the saved models are full scikit-learn Pipelines.

These files are git-ignored: they are derived from the competition datasets, which the terms say must not be published.
