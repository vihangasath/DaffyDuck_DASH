# Waypoint Delivery Planning: Frontend Plan

> **Update (26 Sep 2026):** this is the original frontend-only plan, kept for the record. The API, the Postgres database and the admin console (now Waypoint People, the HR panel) are built, and the system is deployed on Render (4 Oct). See [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`INTEGRATION.md`](INTEGRATION.md).

> Scope right now: **frontend only** (Next.js). The backend API, database and Datathon models are **documented as integration points, not built**.
> Deadlines (Asia/Colombo): Designathon **Tue 29 Sep 23:59** · Hackathon **Sun 4 Oct 23:59** · Datathon **Fri 9 Oct 23:59**.

---

## 1. What existing systems teach us

| System | Pattern worth borrowing | How we adapt it for Waypoint |
|---|---|---|
| **Onfleet** | "Unassigned" sidebar; drag a task onto a driver or into a specific route position. POD by photo, signature, barcode and notes. | Unassigned/deferred panel with drag-drop onto *vehicle → trip* lanes. Every drop is **validated live** against the constraints. |
| **OptimoRoute** | After auto-planning, a **"Not Scheduled"** tab lists orders that could not fit. | Our "Deferred" list gives *why* for each order (reefer full, van-only, window, fuel) and *what it costs* (days unserved, perishables at risk). |
| **Routific** | Planner **flags** rule breaks instead of hiding them; capacity strict or soft. | Hard constraints block the move. Soft risks (tight window, high late-probability) show as amber warnings. |
| **Locus / FarEye** | Control tower; proactive exception alerts *before* a window is missed; ETA notifications to recipients. | Dispatcher "Live" board is sorted by exception. Store managers get an ETA and **deferral notices** automatically. |
| **Dock tools** (DataDocks, LoadingCalendar) | Tablet at the dock, touchscreen dashboards, QR check-in. | Loader uses a shared tablet: pick a vehicle by bay/QR, get a **LIFO load list**, tick items off, flag shortfalls. |
| **Keells Peliyagoda DC** (real SL context) | DC works round the clock; fresh goods reach stores early next morning. | Matches the 3:30–8:00 AM Fresh window, so the Fresh wave is the critical path. |

**Where we stand out**
1. **Explainable deferrals with fairness.** Each order gets a priority score from `days_since_last_served`, `deferred_yesterday`, chilled/perishable, window tightness and festival ramp. No outlet should be skipped twice in a row without the dispatcher saying so explicitly.
2. **Binding-constraint view.** A capacity-pressure strip shows reefer, van, weight/volume, Fresh-minutes and fuel usage. The dispatcher sees *what is limiting* today, not just that it doesn't fit.
3. **The loop closes across roles.** Dispatcher → loader (load list) → driver (run) → store (ETA, POD, receipt), and each step feeds back to the one before (shortfall → re-plan; issue → dispatcher).
4. **Offline-first driver app** with a visible sync outbox and no silent data loss.

---

## 2. Tech stack (frontend)

- **Next.js 15 (App Router) + TypeScript**, Tailwind CSS, shadcn/ui (Radix) components
- **TanStack Query** for server state (against mock adapter now) · **Zustand** for UI state
- **dnd-kit** for the drag-drop allocation board
- **Serwist** (service worker) + **Dexie** (IndexedDB) for the offline driver app and its outbox queue
- **MapLibre GL** + OpenStreetMap tiles for the route and district map (no API key needed)
- **Recharts** for capacity and forecast charts
- Playwright for smoke tests of the judge walkthrough

### Data-access seam (lets the backend drop in later)
```
src/lib/api/
  types.ts          ← domain types (Outlet, Vehicle, Order, Trip, Stop, PodRecord, Deferral…)
  client.ts         ← interface WaypointApi { getOrders(), savePlan(), postPod(), … }
  mock/             ← MockApi: in-memory + localStorage, seeded from /data fixtures  ← BUILT NOW
  http/             ← HttpApi: fetch() against REST endpoints in docs/INTEGRATION.md  ← DOCUMENTED ONLY
```
One environment variable (`NEXT_PUBLIC_API_MODE=mock|http`) chooses the adapter. The UI never imports `mock/` directly.

### Planning engine
Pure TypeScript module `src/lib/planner/`:
- a constraint checker, which drives the live validation on every drag
- a greedy priority allocator plus a light improvement pass

It runs in the browser for now. Because it has no framework dependencies it can move behind `POST /plans/auto` later without changes. *(Needs your confirmation. See Open questions.)*

---

## 3. Screens by role

### Dispatcher (desktop, Peliyagoda office, stable connection)
| # | Screen | Purpose |
|---|---|---|
| D1 | **Today / Order close** | 4 PM cutoff countdown, confirmed-order queue by brand/depot, late orders shown as rolling to the next run, capacity-pressure strip |
| D2 | **Plan & Allocate** ⭐ | Auto-plan button. Vehicle → Trip 1 / Trip 2 lanes with weight, volume and minutes bars. Unassigned/Deferred panel. Live validation, a reason picker for every deferral, publish plan |
| D3 | **Deferral log & fairness** | Outlets skipped recently, repeat-deferral alerts, reason history (the audit trail the brief asks for) |
| D4 | **Live control tower** | Trips in progress, ETA vs window, exceptions first (late risk, driver offline, shortfall, failed delivery) |
| D5 | **Capacity outlook** | 10-week demand forecast by depot and brand → reefer, vehicle and driver needs. *Datathon Task 2A integration placeholder* |
| D6 | **Fleet** | Vehicle status (available / workshop), weekly fuel quota used vs remaining |

### Loader (shared tablet at the Peliyagoda or Kandy dock; phone-sized too)
| L1 | **Dock queue** | Vehicles due to depart, by wave (Fresh 3:30 AM, Style/Tech day), load status |
| L2 | **Load list** ⭐ | Stops in **reverse order** (last stop loaded first), chilled items grouped, tick-off checklist, weight/volume progress |
| L3 | **Flag shortfall / damage** | Mark items missing or damaged, add a photo, then **Release** or **Hold for dispatcher**; the dispatcher is notified to re-plan |

### Driver (personal phone, on the road, often offline)
| R1 | **My run** | Today's trips and stops, ETAs, sync-status pill |
| R2 | **Stop detail** | Window, mall window, dock type, access notes, "Navigate", call store |
| R3 | **Deliver / POD** ⭐ | Arrived → unload → quantities received, exceptions (short/damaged/refused), photo, signature, receiver name. Large tap targets, usable when stopped |
| R4 | **Sync outbox** | Queued records with timestamps; retry; conflicts shown, never dropped |

### Store manager (desktop or phone at the outlet)
| S1 | **Place order** | Dry and chilled order lines (Fresh can have two orders per day), cutoff countdown, instant **confirmation** with a reference |
| S2 | **Deliveries** | Status timeline, ETA window, **deferral notice with reason and new date** |
| S3 | **Confirm receipt** | Check against the POD, report an issue (short, damaged, temperature), dispute trail |

---

## 4. Degradation (failure) screens

| Scenario | Why it matters to Waypoint | Priority |
|---|---|---|
| **"Dead zone on the Kandy corridor."** Driver loses signal mid-run in the hill country | Brief lists this explicitly. POD must not depend on memory; the dispatcher must see "last synced 42 min ago, 3 stops pending" rather than a false "on time" | **Primary**, fully designed |
| **"Short on the dock."** Loader finds chilled items missing at 3:40 AM | Stops a vehicle leaving with the wrong load; forces a same-hour re-plan and store notice | Secondary |
| **"Demand beats the fleet."** Pre-festival peak with vehicles in the workshop | This is the core business problem and matches Datathon 2B. The deferral flow shows the reasoning | Covered by D2 |

---

## 5. Integration points (documented, not built) → `docs/INTEGRATION.md`
- **REST contract**: `/auth`, `/orders`, `/orders/:id/confirm`, `/plans/:date` (GET/PUT), `/plans/auto`, `/trips/:id/load-check`, `/stops/:id/pod`, `/sync/batch` (idempotent on a client UUID), `/deferrals`, `/outlets`, `/vehicles`, `/calendar`, `/forecast`
- **Events** (future WebSocket/SSE): `plan.published`, `load.shortfall`, `stop.completed`, `order.deferred`, `driver.offline`
- **Datathon hooks**
  - `pred_service_min` replaces the service-allowance table in ETA and trip-minute calculations
  - `pred_late_prob` becomes a late-risk badge on stops and on D4
  - Task 2A forecast feeds D5
  - Task 2B policy mirrors the priority scoring in `planner/`
- **Data model** (for a Postgres + Prisma backend later): Outlet, Vehicle, Depot, CalendarDay, Order, OrderLine, Plan, Trip, Stop, LoadCheck, PodRecord, Deferral, SyncEvent, User(role)
- **Seed data**: CSVs (`outlets`, `vehicles`, `calendar`, `district_travel`, `service_allowance`) converted to JSON fixtures under `/data`

---

## 6. Proposed repo layout
```
/app/(auth)/login
/app/dispatcher/{today,plan,deferrals,live,capacity,fleet}
/app/loader/{queue,[vehicleId]}
/app/driver/{run,stop/[id],outbox}
/app/store/{order,deliveries,receipt/[id]}
/src/components/{ui,shared,dispatcher,loader,driver,store}
/src/lib/{api,planner,offline,domain}
/data/*.json         ← generated from the shared CSVs
/docs/{PLAN,INTEGRATION,ARCHITECTURE,DESIGN-RATIONALE,PERSONAS,AI-DISCLOSURE}.md
```

## 7. Timeline
| Date | Work |
|---|---|
| Fri 25 Sep | Scaffold, design tokens, role switcher/login, domain types, fixtures, mock API |
| Sat 26 Sep | Planner constraint checker and auto-allocator; D1, D2 |
| Sun 27 Sep | Loader L1–L3, driver R1–R3, offline outbox (R4) |
| Mon 28 Sep | Store S1–S3, D3, D4, degradation screens, cross-role notifications |
| Tue 29 Sep | Polish, personas and rationale docs, prototype recording → **Designathon submit** |
| 30 Sep – 4 Oct | Backend (later phase), D5/D6, hardening, Docker, deploy |

---

## 8. Open questions
1. **Datasets.** Please put the Drive CSVs into `/Users/vihangasathsara/Documents/RootCode/data/raw/`. Until then I'll build against fixtures with the same schema.
2. **Planner location.** OK to run the allocation engine in the browser as a pure TS module for now? It's needed for a meaningful demo and ports to the API unchanged.
3. **Designathon prototype.** The brief says "use a design tool of your choice". Will you also produce Figma frames, or submit the coded prototype plus screenshots? Worth confirming with tech-triathlon@rootcode.io.
4. **Team name / solution name.** Needed for repo and file naming (`TeamName_SolutionName`).
