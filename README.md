# Waypoint Delivery Planning · Team Daffy Duck

Tech-Triathlon 2026. One system that connects **ordering → planning → loading → delivery → receipt** for Waypoint Fresh, Style and Tech. Every deferral is explainable, and drivers keep working when the signal drops.

**Repository:** [https://github.com/vihangasath/IntelligentEnterprise-RootCode](https://github.com/vihangasath/IntelligentEnterprise-RootCode)

> **Status (27 Sep 2026):** Full stack. A **Postgres database** stores every record: depots, branches, vehicles, drivers, products, user accounts, orders, plans, loading, deliveries, receipts and the audit log. An **API service** holds the business rules and checks role authorization. Two front ends sit on top: the **operations app** for dispatchers, loaders, drivers and stores, and **Waypoint People**, the HR department's panel. Everyone signs in with the credentials HR issued and lands on their own workspace.

## Repository layout

```
apps/api/        Waypoint API (Hono + Drizzle): database, migrations, auth, business rules, people (HR) and network endpoints, live events
  src/db/          schema.ts (31 tables), seed.ts (first-run data), client.ts (embedded Postgres or a Postgres server)
  drizzle/         SQL migrations (applied on start-up)
apps/web/        Operations app (Next.js 16): dispatcher (incl. network records: vehicles, branches, depots, products), loader, driver (offline-first) and store screens
apps/admin/      Waypoint People, the HR panel (Next.js 16): staff directory for every role, licence renewals, sign-in access, activity log
packages/core/   Shared by the API and the apps: domain model, planner (+ tests), business rules, API contract, dataset seed
packages/ui/     Shared design system: tokens (theme.css) and UI kit
data/            Shared competition datasets (local only, not committed)
design/figma-build/  Scripts that build the Designathon Figma file
docs/            Plan, integration contract, architecture, AI disclosure
```

## Run it

**Local Setup (Node ≥ 22.18). Nothing else to install.**

```bash
git clone https://github.com/vihangasath/IntelligentEnterprise-RootCode.git
cd IntelligentEnterprise-RootCode
npm install && npm run dev
```

This starts three services:

| Service | URL | What it is |
|---|---|---|
| Operations app | http://localhost:3000 | Dispatchers, loaders, drivers, store managers |
| Waypoint People | http://localhost:3001 | HR officers |
| API | http://localhost:4000 | Used by both apps (they proxy `/api`), health check at `/` and `/api/health` |

In development the API runs an **embedded Postgres** (PGlite), stored in `./.data/pglite`. On first start it creates the tables and seeds them from `packages/core/src/seed.json`. The root dev/build/test commands create an **independent synthetic demo seed** when the private competition CSVs and local seed are absent. If the CSVs are present under `data/General Data/` and `data/Training Data/` and `data/Test Data/`, those commands rebuild the seed from the shared dataset instead. `npm run db:reset` deletes that folder, so the next start builds a fresh database. To use a Postgres server instead, set `DATABASE_URL`. `npm run seed:data` rebuilds `packages/core/src/seed.json` from the CSVs in `/data` (the folder layout from the organisers' Drive).

**Docker (real Postgres 17)**

```bash
cp .env.example .env && docker compose up --build
```

**Tests:** `npm test` runs:
- the planner tests: every Task 2B feasibility rule on the active seed (the shared peak day for the judged build, or the independent synthetic public fallback), refused manual moves and fairness;
- the API tests: logins and role checks, the whole walkthrough over HTTP, idempotent driver sync, the audit trail, and state that survives a restart.

## Accounts

Credentials are issued by HR in Waypoint People, from the person's folder in the **Staff directory**. Every login belongs to one staff record, and its role and workplace come from that record: a driver (dispatch assigns the vehicle), a branch, or a depot. After signing in, each person lands straight on their own screens. HR officers use Waypoint People; the operations app sends them there.

Seeded accounts (password **`waypoint`** for all; change them in Waypoint People, under **Settings** and each person's folder, before any real use):

| Where | Username | Who | Lands on |
|---|---|---|---|
| Waypoint People | `admin` | Anjali Wickramasinghe (HR officer) | Front desk |
| Operations app | `dispatcher` | Nimali Perera | Dispatch console, Peliyagoda DC (Kandy hub is one click away) |
| Operations app | `loader` | Kasun Jayasinghe | Peliyagoda dock queue |
| Operations app | `driver` | Ruwan Silva | Driver app on VEH011, his assigned vehicle (dispatch reassigns it under **Network records → Vehicles**) |
| Operations app | `store` | Dilani Fernando | OUT007 Rajagiriya. An area-manager login, so she can switch to any Peliyagoda branch |

Sign-ins are per browser tab in the operations app, so you can run each role in its own tab and watch changes appear live in the others.

**Demo day: Thu 18 Dec 2025.** It is one week before Christmas (festival ramp 0.3), not a payday, and outside the monsoon, so it matches peak-day scenario S1.
- Peliyagoda's 85 orders and its fleet (10 vehicles in the workshop) are the **Task 2B S1 files**.
- Kandy's 59 orders are that day's real rows from `deliveries_train.csv`.
- Service history, fuel already used this week and weekly volumes come from the training data.
- Drivers, plate numbers, phone numbers and licences are **synthetic demo records**, one driver per vehicle, because the datasets don't identify drivers.

To restore the start of the day, sign in as `dispatcher` and use **Network records → Demo day → Reset the demo day**. It keeps staff, accounts, master data and the activity log.

## Judge walkthrough (≈ 10 minutes, four tabs)

1. **Store: place an order.** Sign in as `store` / `waypoint`, then open **New order**, choose *Chilled*, add a few items and submit. You get an instant reference (`WP-1101`), and the order appears in the dispatcher's queue.
2. **Dispatcher: close orders.** In a new tab, sign in as `dispatcher`. **Today** shows the confirmed queue. Demand vs capacity shows chilled 182 m³ against 172 m³ of refrigerated capacity, and the watch list shows 10 vehicles in the workshop and outlets skipped yesterday. Click **Close orders & auto-plan**.
3. **Dispatcher: understand the plan.** **Plan & allocate** marks refrigerated capacity as **Limiting**. 72 of 85 orders are served and every deferral has a reason. Click a deferred order (e.g. `S1-075`) to see its priority breakdown, why it was deferred, and what happens if it's deferred again.
4. **Dispatcher: try to break a rule.** Drag a chilled stop onto a dry-box trip. The drop target turns red with the rule ("*… is not refrigerated*") and the move is refused. Drag a stop onto a valid trip and it lands. Every move is re-validated.
5. **Dispatcher: publish.** Click **Publish to loaders**. The loader lists, driver runs and store notices are created. Deferred outlets get a notice with the reason.
6. **Loader: load in reverse order.** In a new tab, sign in as `loader` and open **VEH011**. The checklist runs from the last stop (deepest in the truck) to the first. Tick every line except one, then **Flag shortfall / damage** → quantity 24 of 28 → **Send & release**.
7. **Dispatcher: see the exception.** **Live tracking** now lists *VEH011 · released with shortfall*. Choosing *Hold vehicle* instead would give the dispatcher Release / Re-pick / Balance tomorrow buttons.
8. **Driver: deliver.** In a new tab, sign in as `driver` (phone width is best). The map pins today's stops. Tap **Arrived**, then **Deliver**. The POD starts from what was actually loaded; sign with your finger, enter the receiver's name and tap **Complete delivery**.
9. **Driver: dead zone.** Go to **More → No signal** (a simulated dead zone for this tab only). Deliver the next stop: it's saved on the phone, the outbox shows *Queued*, and a reload still shows the whole run.
10. **Dispatcher: change the run while the driver is offline.** In the dispatcher tab, select one of VEH011's later stops and choose **Defer order**. After ~2 minutes, Live tracking shows VEH011 as *No signal*.
11. **Driver: reconnect.** Turn **No signal** off. The queued records sync with their original times, and the driver sees *"Your run was changed by dispatch — Removed: …"*.
12. **Store: confirm receipt.** Switch the store header to the delivered outlet (e.g. `OUT010 Mount Lavinia`). The order shows **Delivered** and the shortfall notice. Click **Confirm receipt**, mark *Damaged* with a note and confirm. The dispatcher gets a *receipt issue* exception.
13. **Plan ahead.** **Capacity outlook** shows the 10-week volume by brand against practical capacity, the refrigerated vehicles needed, and the ×2 peak-day factor. **Deferrals** shows each outlet's 14-day service strip and the audit log (CSV export).
14. **HR: look after the people.** Open http://localhost:3001 (Waypoint People) and sign in as `admin`, the HR officer.
    - **Front desk** shows what needs HR today: driving licences due in the next 90 days, who is on leave and when they're back, and staff who can't sign in yet.
    - **Staff directory** holds one folder per employee in every job (drivers, loaders, dispatchers, store managers, HR). Pull a driver's folder and use **Issue login** on the Sign-in access card. The username and a generated password are ready to share. Sign in with them in the operations app: you land on the vehicle dispatch assigned.
    - **Renewals** files every driving licence under the month it runs out. **Activity log** is HR's logbook of record changes, logins and sign-ins.
    - Staff beyond the five demo accounts (loaders, dispatchers, store managers, a second HR officer) are **synthetic demo records**.
15. **Dispatch: keep the network true.** In the dispatcher tab, **Network records** holds vehicles (and which driver runs each), branches, depots, products and the demo-day reset.

## How the planner decides (short version)

- **Hard rules** (never broken): one brand and one district per trip; refrigerated for chilled; vans for van-only; home depot only; weight and volume; at most 2 trips; Fresh ≤ 270 min and Style/Tech ≤ 480 min (Task 2B trip-time formula); the outlet's delivery window (mall windows included); weekly fuel quota.
- **Order of allocation:** scarce vehicles first (chilled van-only → reefer vans, chilled → reefers, ambient van-only → vans, then the rest). Within each group, **outlets skipped yesterday go first**. Then the engine repeatedly fills the trip that serves the most priority per vehicle-minute.
- **Priority score (shown in the UI):** skipped yesterday +30 · chilled +20 · days since served · Fresh daily +10 · festival ramp · tight or mall window.
- **Road conditions:** each district's disruption index for the plan date (`road_conditions.csv`, 100 = normal) stretches its travel legs by 100 ÷ index. Dock handling time is not affected. Trips with an index below 95 show the stretch on the plan board. In the route-leg history, actual vs planned leg times follow this ratio closely.
- **Deferral reasons** come from the rule that actually blocked every candidate vehicle. On the demo day the auto-plan defers 13 chilled orders (refrigerated capacity and Fresh windows run out), and one Style order (40.7 m³) is larger than any available vehicle, so it can never be served whole.

## Departures from the Designathon design

- The demo date is **18 Dec 2025 (pre-Christmas)** instead of the Figma's Nov 2026 Deepavali example. The calendar data ends in June 2026, and this date matches scenario S1.
- Districts, outlets and vehicles use the **real dataset values** (e.g. Galle, Matara, Puttalam; VEH011), replacing the Figma placeholders. Outlet display names are fictional neighbourhoods assigned deterministically.
- **Delivery windows are a hard rule** in the app (the Figma showed late arrivals as warnings). Second Fresh trips must still reach stores before their windows close.
- The live map is a **schematic district network**, not a street map. No map API key is needed and it works offline.
- Demo convenience not in the design: the per-tab *No signal* switch. The branch switcher is only offered to area-manager store logins.
- Added after the Designathon: Waypoint People (the HR panel, with a staff directory for every role), real sign-in with HR-issued credentials, dispatch-owned network records, and the Postgres-backed API.

## Datasets and confidentiality

The competition terms forbid publishing the datasets or their derivatives. `data/` and the generated `packages/core/src/seed.json` are therefore **git-ignored**, as is the local database in `.data/`. A public fresh clone boots with an independently generated synthetic fixture that follows the booklet's published network counts. **The judged build must use the shared dataset:** place the organisers' CSVs in `data/General Data/`, `data/Training Data/`, and `data/Test Data/` before `npm run dev` or `docker compose up --build`. Do not publish the private seed or a Docker image containing it without organiser authorization.

## More

- Plan and screen map: [`docs/PLAN.md`](docs/PLAN.md)
- API endpoints, data model and Datathon hooks: [`docs/INTEGRATION.md`](docs/INTEGRATION.md)
- Architecture and data model: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- AI tool disclosure: [`docs/AI-DISCLOSURE.md`](docs/AI-DISCLOSURE.md)
