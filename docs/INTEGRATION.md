# Integration contract: web apps ↔ API ↔ Datathon models

The operations app (`apps/web`) and the admin console (`apps/admin`) talk only to the API (`apps/api`), through a same-origin `/api/*` proxy. The API owns the Postgres database. The web app's screens use one interface, `WaypointApi` (`packages/core/src/contract.ts`), implemented by `apps/web/src/lib/api/http.ts`. The admin console's types are in `packages/core/src/admin.ts`.

Every request except sign-in carries `Authorization: Bearer <token>`. Errors come back as `{ "error": "<message for the user>" }` with a 4xx/5xx status: 401 means the session ended, 403 means the role or scope isn't allowed, 409 means a business rule refused.

## Auth

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/login` | `{ username, password, app: "web" \| "admin" }` → `{ token, user }`. Admins are refused by `web` (with `adminUrl`); non-admins are refused by `admin`. 8 failures per username per 10 min are throttled |
| GET | `/api/auth/me` | The session user, rebuilt from the database (role, depot, driver's current vehicle, store scope) |
| POST | `/api/auth/logout` | Revokes this session |
| POST | `/api/auth/password` | `{ current, next }` |

## Operations (dispatcher, loader, driver, store)

`GET /api/ops/snapshot` → `{ db, reference }`: the operational state plus the reference data (depots, branches, vehicles, products, travel, calendar, history).

Each operation is `POST /api/ops/<name>` with a JSON body. It is validated, checked against the caller's role and scope, run, persisted in one transaction and audited:

| Operation | Who | Body |
|---|---|---|
| `placeOrder` | store | `{ outletId, temp, lines: [{ skuId, qty }] }`. After the 16:00 cutoff the order is stamped for the next run |
| `closeOrdersAndPlan` · `replan` · `publishPlan` | dispatcher | `{ depot }` |
| `moveOrder` | dispatcher | `{ depot, orderId, target: { tripId } \| { newTripOn } \| { defer: true, code?, note? } }`. Refused moves return `ok: false` and `violations[]` |
| `setVehicleStatus` | dispatcher | `{ vehicleId, status }` |
| `setLoadLine` · `releaseTrip` | loader (own dock) | `{ tripId, key, loaded }` · `{ tripId }` |
| `flagShortfall` | loader (own dock) | `{ tripId, orderId, skuId, loaded, kind, decision: "release" \| "hold", photo }` |
| `resolveShortfall` · `resolveException` | dispatcher | `{ id, resolution }` · `{ id }` |
| `syncDriverEvents` | driver (own vehicle) | `{ vehicleId, events[] }`. **Idempotent** on each event's `id` → `{ accepted, duplicates, planVersion }` |
| `ackNotice` · `confirmReceipt` | store (own branch) | `{ id, response }` · `{ orderId, lines, issues }` |

**Live updates:** `GET /api/events?token=…` is a Server-Sent Events stream. It sends `change` with data `ops` (operational state changed) or `reference` (master data changed), and the apps refetch.

## Admin (administrators only)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/overview` | Counts, today per depot, alerts (licence renewals, workshop, drivers without vehicle or login), recent activity |
| GET | `/api/admin/lookups` | Options for forms (depots, districts each depot serves, vehicles, branches, drivers) |
| GET · PATCH | `/api/admin/depots` · `/:id` | Depots are edited, not created (the planner is configured per depot) |
| GET · POST · PATCH | `/api/admin/outlets` · `/:id` | Branches. The district must be one the depot serves. Closing a branch stops new orders |
| GET · POST · PATCH | `/api/admin/vehicles` · `/:id` | Refuses to retire or re-type a vehicle with trips in today's plan |
| GET · POST · PATCH | `/api/admin/drivers` · `/:id` | The assigned vehicle must be from the driver's depot. "Left" disables their login |
| GET · POST · PATCH | `/api/admin/products` · `/:id` | Existing orders keep their stored lines |
| GET · POST · PATCH | `/api/admin/users` · `/:id` | Logins: role plus what they're attached to (driver record, branch and scope, or depot). Access changes sign the user out everywhere. The last active admin can't be disabled |
| POST | `/api/admin/users/:id/password` | Sets a new password and revokes all of that user's sessions |
| GET | `/api/admin/orders` | Today's orders with their live status |
| GET | `/api/admin/activity` | Audit log. `?limit&before&q&area=ops\|admin\|auth` |
| POST | `/api/admin/reset` | Restores the start of the demo day. Keeps master data, accounts and the audit log |

## Offline sync rules (driver)

1. Every action is written to IndexedDB (`outbox`) **before** any network call. The last run is cached in `snapshot`.
2. `POST /api/ops/syncDriverEvents` sends queued events in order. The server ignores event ids it has already processed (`driver_events` table).
3. Facts from the field (arrived, delivered, POD, problem) keep their **device time**. The server records its own `syncedAt`.
4. If the plan version changed while offline, the device diffs its cached run against the new one and shows the driver the removed and added stops. Nothing is silently overwritten.
5. A heartbeat sync every 20 s gives the dispatcher "last seen". In known hill-country dead zones, alerts escalate only after the usual gap.

## Datathon hooks

| Model output | Where it plugs in | Replaces today |
|---|---|---|
| Task 1 `pred_service_min` | `evaluateTrip` handling time → ETAs, trip minutes | `service_allowance.csv` |
| Task 1 `pred_late_prob` | late-risk badge on D4, driver next stop, store ETA | baseline: ETA vs window close |
| Task 2A `pred_total_volume_m3`, `pred_chilled_volume_m3` | Capacity outlook (D5) | baseline: 6-week mean × operating days × festival uplift |
| Task 2B policy | `autoPlan` priority and pools | same rules; the notebook and the app share the policy |

## Data model

Built in `apps/api/src/db/schema.ts`, and migrations are in `apps/api/drizzle/`:

```
master       depots · outlets (branches) · vehicles (status, fuel this week) · drivers (licence, assigned vehicle) · products
             district_travel · service_allowance · calendar_days · road_conditions · service_history · weekly_volume · app_meta
access       users (role, depot | branch + scope | driver) · sessions (hashed token, expiry)
operations   orders · order_lines · ops_days (cutoff) · plans (current per depot) · trips · trip_stops · plan_deferrals
             loads · load_lines · shortfalls · stop_records (POD, problems) · driver_events (idempotency + raw device record)
             receipts · notices · exceptions · driver_sync · deferral_log
audit        audit_log (who, role, action, entity, summary, detail) for every write, sign-in and admin change
```

Foreign keys tie operations to master data (for example, an order to its branch, a trip to its vehicle, a stop record to its order), so a record can't point at something that doesn't exist.

**Outlet coordinates.** The shared datasets have no outlet locations. The seed places each branch at the centre of its display neighbourhood (`packages/core/src/domain/geo.ts`, approximate) and stores it in `outlets.lat` / `outlets.lng`. Administrators can correct a pin in the branch editor, and the driver map uses the stored position. The map uses OpenStreetMap's public tiles, which suit a demo; production traffic needs a hosted tile service.
