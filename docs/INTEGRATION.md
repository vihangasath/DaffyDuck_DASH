# Integration contract: web apps ↔ API ↔ Datathon models

The operations app (`apps/web`) and Waypoint People, the HR panel (`apps/admin`), talk only to the API (`apps/api`), through a same-origin `/api/*` proxy. The API owns the Postgres database. The web app's screens use one interface, `WaypointApi` (`packages/core/src/contract.ts`), implemented by `apps/web/src/lib/api/http.ts`. Waypoint People's types are in `packages/core/src/people.ts`, and the dispatcher's network records types are in `packages/core/src/records.ts`.

Every request except sign-in carries `Authorization: Bearer <token>`. Errors come back as `{ "error": "<message for the user>" }` with a 4xx/5xx status: 401 means the session ended, 403 means the role or scope isn't allowed, 409 means a business rule refused.

## Auth

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/login` | `{ username, password, app: "web" \| "admin" }` → `{ token, user }`. HR accounts (internal role `admin`) are refused by `web` (with `adminUrl`, the Waypoint People address); everyone else is refused by `admin`. 8 failures per username per 10 min are throttled |
| GET | `/api/auth/me` | The session user, rebuilt from the database (role, depot, driver's current vehicle, store scope) |
| POST | `/api/auth/logout` | Revokes this session |
| POST | `/api/auth/password` | `{ current, next }` |

## Operations (dispatcher, loader, driver, store)

`GET /api/ops/snapshot` → `{ db, reference }`: the operational state plus the reference data (depots, branches, vehicles, products, travel, calendar, history). `db` is scoped to the caller: dispatchers get everything, loaders their depot, drivers their vehicle, store managers their outlets (see [`ARCHITECTURE.md → Who can read what`](ARCHITECTURE.md#who-can-read-what)).

Each operation is `POST /api/ops/<name>` with a JSON body. It is validated, checked against the caller's role and scope, run, persisted in one transaction and audited:

| Operation | Who | Body |
|---|---|---|
| `placeOrder` | store | `{ outletId, temp, lines: [{ skuId, qty }] }`. After the 16:00 cutoff the order is stamped for the next run |
| `closeOrdersAndPlan` · `replan` · `publishPlan` | dispatcher | `{ depot }` |
| `moveOrder` | dispatcher | `{ depot, orderId, target: { tripId } \| { newTripOn } \| { defer: true, code?, note? } }`. Refused moves return `ok: false` and `violations[]` |
| `setVehicleStatus` | dispatcher | `{ vehicleId, status }` |
| `setLoadLine` · `releaseTrip` | loader (own dock) | `{ tripId, key, loaded }` · `{ tripId }` |
| `flagShortfall` | loader (own dock) | `{ tripId, orderId, skuId, loaded, kind, decision: "release" \| "hold", photo, photoIds? }`. Photos are uploaded first (see below) |
| `resolveShortfall` · `resolveException` | dispatcher | `{ id, resolution }` · `{ id }` |
| `syncDriverEvents` | driver (own vehicle) | `{ vehicleId, events[], position?, connectivity?, check? }`. **Idempotent** on each event's `id` → `{ accepted, duplicates, rejected, planVersion, missing? }`. A delivered event's `pod` carries `code` (or `noCode` with a reason) and `photoIds`; the server sets `codeOk` |
| `checkCode` | driver (own run) | `{ orderId, code }` → `{ ok, attemptsLeft }`. Nothing is stored; 5 wrong codes per order in 30 min, then 429 |
| `ackNotice` · `confirmReceipt` | store (own branch) | `{ id, response }` · `{ orderId, lines: [{ skuId, name, driverQty, receivedQty, damagedQty? }], issues, photoIds? }` |

**Photos:** `PUT /api/photos/:id?kind=shortfall|pod|receipt&orderId=…` with the raw JPEG/PNG/WebP body (≤ 6 MB). The id is made on the phone, so a retried upload is idempotent. Loaders upload for their dock, drivers for stops on their run, stores at receipt. `GET /api/photos/:id` returns the image to anyone whose snapshot lists it in `db.photos`.

**Live watch:** every 30 s the API projects each released run (`packages/core/src/live.ts`). A driver at a stop longer than its expected handling time + 10 min raises a `dwell` exception; a stop projected 5+ min past its window sends the store a `late` notice ("We're sorry, we'll be about N min late. Is that OK?"), again if it slips another 15 min. The store's answer reaches dispatch as a `late_reply` exception.

**Live updates:** `GET /api/events?token=…` is a Server-Sent Events stream. It sends `change` with data `ops` (operational state changed) or `reference` (master data changed), and the apps refetch.

## People (HR officers only)

Waypoint People, the HR panel. Every write is audited with role `hr`.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/people/overview` | Headcount, who's in post by depot and job, licences due within 90 days (real calendar), who's on leave, active staff with no login, new starters, sign-in counts, recent people and access activity |
| GET | `/api/people/lookups` | Depots, and branches for store managers |
| GET · POST · PATCH | `/api/people/staff` · `/:id` | The staff directory: one record per employee in every job. A driver's record also creates and updates the operational `drivers` row (licence, status). A record can't change to or from driver. "Left" turns off the login and ends its sessions; a driver who leaves or changes depot gives their vehicle back to dispatch. HR can't remove their own access or the last HR login |
| POST | `/api/people/staff/:id/login` | Issues a login for a staff record. The role and workplace come from the record (driver → driver, store manager → store for their own branch, HR officer → `admin`) |
| PATCH | `/api/people/logins/:userId` | `{ active }`. Turning access off signs them out everywhere |
| POST | `/api/people/logins/:userId/password` | Sets a new password and revokes all of that user's sessions |
| GET | `/api/people/activity` | The HR log: staff, driver, login and sign-in entries. `?limit&before&q&area=people\|access\|signin` |

## Network records (dispatchers)

Used by the dispatch console's **Network records** screens in the operations app.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/network/lookups` | Depots, districts each depot serves, drivers who can be put on a vehicle |
| GET · PATCH | `/api/network/depots` · `/:id` | Depots are edited, not created (the planner is configured per depot) |
| GET · POST · PATCH | `/api/network/outlets` · `/:id` | Branches. The district must be one the depot serves. Closing a branch stops new orders |
| GET · POST · PATCH | `/api/network/vehicles` · `/:id` | `driverId` assigns the vehicle's driver (same depot, not left). Refuses to retire or re-type a vehicle with trips in today's plan |
| GET · POST · PATCH | `/api/network/products` · `/:id` | Existing orders keep their stored lines |
| POST | `/api/network/reset` | Restores the start of the demo day. Keeps master data, staff, accounts and the audit log |

## Offline sync rules (driver)

1. Every action is written to IndexedDB (`outbox`) **before** any network call. The last run is cached in `snapshot`.
2. `POST /api/ops/syncDriverEvents` sends queued events in order. The server returns `accepted`, `duplicates`, and `rejected: [{ id, reason, retry }]`. Accepted and duplicate records are marked synced. A rejection with `retry: true` (the loader hasn't released the trip yet) stays queued; any other rejection moves to **Not accepted** on the driver's Outbox screen with the server's reason, so it is never retried forever or lost silently. The `driver_events` table makes retries idempotent.
3. Releasing a trip records its vehicle-to-stop assignments. If dispatch removes a stop while the driver is offline, queued records from that released vehicle can still sync; the actual delivery or problem takes precedence over the earlier deferral in the store status. Unassigned stops are refused and kept on the phone under **Not accepted**; records for a trip that hasn't been released stay queued until it is.
4. Facts from the field (arrived, delivered, POD, problem) keep their **device time**. The server records its own `syncedAt`. If the plan version changed while offline, the device diffs its cached run against the new one and shows removed and added stops.
5. A heartbeat sync every 20 s gives the dispatcher "last seen". In known hill-country dead zones, alerts escalate only after the usual gap.
6. POD photos wait in IndexedDB (`photos`) and upload before the events that list them. Each sync also carries the phone's latest location (when the driver shares it), its offline/online changes (`netlog`), and a check: the ids it marks as synced for the current plan. Ids the database lacks come back as `missing` and are queued again.

## Datathon hooks

The trained models run in a separate Python service, `apps/models`. It is a placeholder until the model files are added to `apps/models/artifacts/` (see the README there). The API calls it when `MODEL_URL` is set, at start-up and after `closeOrdersAndPlan`, `replan`, `moveOrder` and `publishPlan`. It serves the answers in `reference.predictions` (`packages/core/src/predictions.ts`). If the service is unset, unreachable, or answers 503 for a task (no model file yet), that task keeps its baseline.

| Model output | Where it plugs in | Baseline without the model |
|---|---|---|
| Task 1 `pred_service_min` | `net.serviceMin` → `evaluateTrip` stop leave times → every ETA: planner, loader, driver run and proof-of-delivery time, store arrival | `service_allowance.csv` |
| Task 1 `pred_late_prob` | `net.lateProb` → `StopEta.lateRisk` → late-risk badges and alerts on dispatcher Live tracking | ETA vs window close (0 until 40 min before it closes, rising to 0.95) |
| Task 2A `pred_total_volume_m3`, `pred_chilled_volume_m3` | Forecast rows of `weeklyVolume` → Capacity outlook and `GET /api/forecast` | 6-week mean × operating days × festival uplift |
| Task 2B policy | `autoPlan` priority and pools | same rules; the notebook and the app share the policy |

Trip **budget** minutes (270 Fresh, 480 Style and Tech) always use the service allowance, as the brief defines them. The Task 1 prediction moves ETAs, and so whether a stop is inside its window.

**API (dispatchers):**

| Method | Path | Notes |
|---|---|---|
| GET | `/api/models` | `{ configured, url, lastError, task1: { source, model, updatedAt, orders }, task2a: { source, model, updatedAt } }`; `source` is `model` or `baseline` |
| POST | `/api/models/refresh` | Asks the model service again now, e.g. after adding a model file |
| GET | `/api/forecast?depot&weeks` | `{ source, model, rows: [{ depot, brand, week, pred_total_volume_m3, pred_chilled_volume_m3 }] }` |

**Model service contract** (`apps/models/server.py`). Request rows use the Datathon test-file columns, so the notebook's preprocessing runs unchanged:

| Endpoint | Request `{ rows }` | Response `{ model, predictions }` |
|---|---|---|
| `POST /predict/task1` | One row per planned stop: the `task1_test_inputs.csv` columns plus the stop's `route_legs_test.csv` leg (`from_point`, `distance_km`, `planned_depart_time`, `planned_travel_duration_min`, `monsoon`, `dow`) | `[{ delivery_id, pred_service_min, pred_late_prob }]` |
| `POST /forecast/task2a` | `task2a_test_inputs.csv` columns: `row_id` (`depot\|brand\|week`), `depot`, `brand`, `iso_year`, `iso_week` | `[{ row_id, pred_total_volume_m3, pred_chilled_volume_m3 }]` |
| `GET /health` | | `{ ok, model, loaded: { task1, task2a } }` |

A task without its model file answers **503**, and the API keeps its baseline for that task.

## Data model

Built in `apps/api/src/db/schema.ts`, and migrations are in `apps/api/drizzle/`:

```
master       depots · outlets (branches) · vehicles (status, fuel this week) · drivers (licence, assigned vehicle) · products
             district_travel · service_allowance · calendar_days · road_conditions · service_history · weekly_volume · app_meta
people       staff (one HR record per employee: job, depot or branch, status, leave, start and leaving dates; drivers link to their drivers row)
access       users (role, depot | branch + scope | driver, linked staff record) · sessions (hashed token, expiry)
operations   orders · order_lines · ops_days (cutoff) · plans (current per depot) · trips · trip_stops · plan_deferrals
             loads · load_lines · shortfalls · stop_records (POD, problems) · driver_events (idempotency + raw device record)
             receipts · notices · exceptions · driver_sync · deferral_log
audit        audit_log (who, role, action, entity, summary, detail) for every write, sign-in and HR or network change
```

Foreign keys tie operations to master data (for example, an order to its branch, a trip to its vehicle, a stop record to its order), so a record can't point at something that doesn't exist.

**Outlet coordinates.** The shared datasets have no outlet locations. The seed places each branch at the centre of its display neighbourhood (`packages/core/src/domain/geo.ts`, approximate) and stores it in `outlets.lat` / `outlets.lng`. Dispatchers can correct a pin in the branch editor, and the driver map uses the stored position. The map uses OpenStreetMap's public tiles, which suit a demo; production traffic needs a hosted tile service.
