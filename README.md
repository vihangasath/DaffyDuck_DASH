# DASH: delivery planning for Waypoint Group · Team Daffy Duck

Tech-Triathlon 2026. **DASH** is one system that connects **ordering → planning → loading → delivery → receipt** for Waypoint Fresh, Style and Tech. Every deferral is explainable, drivers keep working when the signal drops, and the driver app has a dark mode for dawn runs and night shifts.

**Repository:** [https://github.com/vihangasath/DaffyDuck_DASH](https://github.com/vihangasath/DaffyDuck_DASH)

> **Status (4 Oct 2026):** Full stack, with proof from the field (delivery codes, photos, phone location and a live watch on every run). A **Postgres database** stores every record: depots, branches, vehicles, drivers, products, user accounts, orders, plans, loading, deliveries, receipts and the audit log. An **API service** holds the business rules and checks role authorization. Two front ends sit on top: the **operations app (DASH)** for dispatchers, loaders, drivers (offline-first, with a dark mode for the cab) and stores, and **Waypoint People**, the HR department's panel. Everyone signs in with the credentials HR issued and lands on their own workspace. The Datathon models have a slot (`apps/models`) but haven't been added yet, so ETAs, late risk and the capacity forecast run on documented baselines (see [Datathon models](#datathon-models-optional)).

## Repository layout

```
apps/api/        Waypoint API (Hono + Drizzle): database, migrations, auth, business rules, people (HR) and network endpoints, live events
  src/db/          schema.ts (33 tables), seed.ts (first-run data), client.ts (embedded Postgres or a Postgres server)
  drizzle/         SQL migrations (applied on start-up)
apps/web/        DASH operations app (Next.js 16): dispatcher (incl. network records: vehicles, branches, depots, products), loader and driver phone apps (installable, offline-first, with dark mode) and store screens
apps/admin/      Waypoint People, the HR panel (Next.js 16): staff directory for every role, licence renewals, sign-in access, activity log
apps/models/     Optional Datathon model service (Python): Task 1 service time and lateness, Task 2A forecast. Model files go in artifacts/
packages/core/   Shared by the API and the apps: domain model, planner (+ tests), business rules, API contract, dataset seed
packages/ui/     Shared design system: tokens (theme.css) and UI kit
data/            Shared competition datasets (local only, not committed)
design/figma-build/  Scripts that build the Designathon Figma file
design/figma-sync/   Figma sync scripts, screen definitions and captured screen snapshots
docs/            Plan, integration contract, architecture, AI disclosure
```

## Run it

**Local Setup (Node ≥ 22.18). Nothing else to install.**

```bash
git clone https://github.com/vihangasath/DaffyDuck_DASH.git
cd DaffyDuck_DASH
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

This starts `db`, `api`, `web` and `admin` with the same ports as above. The optional `models` service only starts with `--profile models` (see [Datathon models](#datathon-models-optional)). An existing Docker database is upgraded in place on the next `up --build`: migrations run and any new demo logins are added, without resetting the day. The web build downloads its font from Google Fonts; on a slow connection that can time out, so just run the command again.

**Configuration.** Every setting has a default, so none is required. Docker reads them from `.env` (copy `.env.example`); `npm run dev` reads them from the shell.

| Variable | Default | What it does |
|---|---|---|
| `POSTGRES_PASSWORD` | `waypoint` | Postgres password shared by the `db` and `api` containers |
| `WEB_PORT` · `ADMIN_PORT` · `API_PORT` | `3000` · `3001` · `4000` | Host ports in Docker (`API_PORT`/`PORT` is also the API's port in development) |
| `SESSION_HOURS` | `12` | How long a sign-in lasts |
| `DATABASE_URL` | unset → embedded PGlite | A Postgres server for the API. Docker sets it to the `db` container |
| `PGLITE_DIR` | `./.data/pglite` | Where embedded Postgres keeps its files in development |
| `ADMIN_URL` | `http://localhost:3001` | Where the operations app sends HR accounts that sign in there |
| `API_URL` | `http://api:4000` | Build-time target of the web and admin `/api` proxy (Docker build argument) |
| `MODEL_URL` | unset → baselines | The Datathon model service, e.g. `http://models:8000` in Docker |
| `MODEL_TIMEOUT_MS` · `MODEL_NAME` | `5000` · `datathon` | How long the API waits for the model service · the model name shown on screen |

**Tests:** `npm test` runs:
- the planner tests: every Task 2B feasibility rule on the active seed (the shared peak day for the judged build, or the independent synthetic public fallback), refused manual moves and fairness. They also check that model predictions move ETAs and late risk but never the brief's trip budgets, and that without a model everything matches the baselines;
- the API tests: logins and role checks, store managers confined to their own branch, what each role may read, the whole walkthrough over HTTP, idempotent driver sync (including refused records), delivery codes, photo upload and access, dwell alerts and late notices, the phone's location, connectivity log and sync check, itemised receipts, the audit trail, state that survives a restart, and the model-service contract against a stand-in service (connected, task without a model file, disconnected);
- the live-projection tests: countdowns from the dock release, a long stop pushing later stops back, and re-anchoring on a recorded delivery.

`npm run typecheck` and `npm run lint` check all workspaces. All three commands pass on a fresh clone.

**Walkthrough smoke tests (Playwright):** with the stack running (`npm run dev` or Docker), `npm run e2e` drives the judge walkthrough below in four browser tabs, runs the driver app on a throttled phone connection, a stalled connection and a real network cut, and checks the field proof end to end (photos from the dock, doorstep and store, delivery codes, the phone's location, the dwell alert and late notice, the connectivity log and the itemised receipt) with each store signed in as its own manager. It resets the demo day first and passes on either seed. Use `PW_CHANNEL=chrome npm run e2e` to run it in your installed Chrome instead of downloading Playwright's browser (`npx playwright install chromium`).

**Fresh-clone check:** `npm run check:fresh` does what a judge does. It clones the committed code (no `data/`), runs `docker compose up --build` on spare ports (3100/3101/4100), runs the e2e suite against it on the synthetic seed, and tears it down. Run it after every merge. The demo script is in [`docs/DEMO.md`](docs/DEMO.md).

## Accounts

Credentials are issued by HR in Waypoint People, from the person's folder in the **Staff directory**. Every login belongs to one staff record, and its role and workplace come from that record: a driver (dispatch assigns the vehicle), a branch, or a depot. After signing in, each person lands straight on their own screens. HR officers use Waypoint People; the operations app sends them there.

Seeded accounts (password **`waypoint`** for all; change them in Waypoint People, under **Settings** and each person's folder, before any real use):

| Where | Username | Who | Lands on |
|---|---|---|---|
| Waypoint People | `admin` | Anjali Wickramasinghe (HR officer) | Front desk |
| Operations app | `dispatcher` | Nimali Perera | Dispatch console, Peliyagoda DC (Kandy hub is one click away) |
| Operations app | `loader` | Kasun Jayasinghe | Peliyagoda dock queue |
| Operations app | `driver` | Ruwan Silva | Driver app on VEH011, his assigned vehicle (dispatch reassigns it under **Network records → Vehicles**) |
| Operations app | `store` | Dilani Fernando | Store deliveries for her branch, OUT007 Rajagiriya |
| Operations app | `store-out001` … | That branch's manager | Every branch's manager signs in to their own branch: `store-` plus the branch id in lower case (`store-out010` is OUT010 Mount Lavinia). The driver's stop card shows the `OUT…` id |
| Operations app | `loader-kandy` | A Kandy hub loader | Kandy dock queue. Each loader sees only their own depot's plan, so a published Kandy plan shows here, not under `loader` |
| Operations app | `driver-kandy` | A Kandy hub driver | Driver app on that driver's Kandy vehicle |

Sign-ins are per browser tab in the operations app, so you can run each role in its own tab and watch changes appear live in the others.

Loaders and drivers work at one depot and see only its plan: a published **Kandy hub** plan appears for `loader-kandy` and `driver-kandy`, not for `loader` and `driver` (Peliyagoda). Store managers see only their own branch; there is no branch switcher. HR can issue further logins from any person's folder in Waypoint People.

**Demo day: Thu 18 Dec 2025.** It is one week before Christmas (festival ramp 0.3), not a payday, and outside the monsoon, so it matches peak-day scenario S1. Which data you see depends on the seed (see [Datasets and confidentiality](#datasets-and-confidentiality)); the walkthrough below works on both.

With the shared dataset (the judged build):
- Peliyagoda's 85 orders and its fleet (10 vehicles in the workshop) are the **Task 2B S1 files**.
- Kandy's 59 orders are that day's real rows from `deliveries_train.csv`.
- Service history, fuel already used this week and weekly volumes come from the training data.
- Drivers, plate numbers, phone numbers and licences are **synthetic demo records**, one driver per vehicle, because the datasets don't identify drivers.

On a public clone without the datasets, an independent synthetic peak day with the same shape is generated instead: 115 Peliyagoda and 45 Kandy orders, the same 10 vehicles in the workshop, and chilled demand about 17% above refrigerated capacity. Order ids start with `DEMO-` instead of `S1-`.

To restore the start of the day, sign in as `dispatcher` and use **Network records → Demo day → Reset the demo day**. It keeps staff, accounts, master data and the activity log.

## Judge walkthrough (≈ 10 minutes, four tabs)

1. **Store: place an order.** Sign in as `store` / `waypoint`, then open **New order**, choose *Chilled*, add a few items and submit. You get an instant reference (`WP-1101`), and the order appears in the dispatcher's queue.
2. **Dispatcher: close orders.** In a new tab, sign in as `dispatcher`. **Today** shows the confirmed queue. Demand vs capacity shows chilled demand above the refrigerated capacity (182 m³ against 172 m³ on the shared dataset), and the watch list shows 10 vehicles in the workshop and outlets skipped yesterday. Click **Close orders & auto-plan**.
3. **Dispatcher: understand the plan.** **Plan & allocate** marks refrigerated capacity as **Limiting**. Most orders are served (71 of 85 on the shared dataset) and every deferral has a reason. Every deferred card in the queue shows its priority breakdown: days since last served, chilled/perishable, window tightness (each shown even at +0), plus festival ramp and brand. Click one (e.g. `S1-075`) for why it was deferred, a suggested fix, and what happens if it's deferred again.
4. **Dispatcher: try to break a rule.** Drag a chilled stop onto a dry-box trip. The drop target turns red with the rule ("*… is not refrigerated*") and the move is refused. Drag a stop onto a valid trip and it lands. Every move is re-validated.
5. **Dispatcher: publish.** Click **Publish to loaders**. The loader lists, driver runs and store notices are created. Deferred outlets get a notice with the reason.
6. **Loader: load in reverse order.** In a new tab, sign in as `loader` (phone width is best: it's a phone app with **Queue · Flags · More** tabs, installable from the browser) and open **VEH011**. The checklist runs from the last stop (deepest in the truck) to the first. Tick every line except one, then **Flag shortfall** → enter the quantity actually loaded (less than planned) → **Send & release**. (To see a photo reach dispatch, choose the *Damaged* tab on the flag screen and add one with **Add photo of the item**.)
7. **Dispatcher: see the exception.** **Live tracking** now lists *VEH011 · released with shortfall*. The vehicle table puts exceptions first: held vehicles, then trips at risk of missing a window (worst first, judged on every stop still to come, not just the next one), then vehicles with no signal. Choosing *Hold vehicle* instead would give the dispatcher Release / Re-pick / Balance tomorrow buttons.
8. **Driver: deliver with proof & dark mode.** In a new tab, sign in as `driver` (phone width is best). Allow location if the browser asks: the phone then shares its position with dispatch. Tap the theme toggle in the header or in **More** to test dark mode for dawn/night shifts—the Leaflet map tiles, signature pad strokes, and checklists adapt automatically to reduce cab glare. Tap **Arrived** (it opens the stop: what to unload and how to reach the dock; note the `OUT…` id on the card), then **Start delivery & POD**. The POD starts from what was actually loaded and needs three things:
    - **The store's delivery code.** Every order has a 6-digit code that only the store and dispatch can see. In a new tab, sign in as that branch's manager (`store-` plus the stop's `OUT…` id, e.g. `store-out010`): **Deliveries** shows a *Delivery code* card on its order. Type the code into the driver's POD: it says *Code matches*. A wrong code is refused (a few tries are allowed). If the receiver has no code, tap **Receiver has no code** and give a reason: the delivery still completes, but dispatch gets a warning to follow up.
    - **A signature and the receiver's name.** Sign with your finger and enter the name.
    - **Photos (optional).** **Add delivery photo** uses the phone's camera, or a file picker on a desktop. The photo stays on the phone with the delivery and uploads when there is signal.

    Then tap **Complete delivery**.
9. **Driver: dead zone.** Go to **More → No signal** (a simulated dead zone for this tab only). Deliver the next stop the same way: the phone can't check the code, so it says *No signal: the code is checked when this syncs*. The stop is saved on the phone, the outbox shows *Queued*, and a reload still shows the whole run. The server checks the code when the record syncs.
10. **Dispatcher: change the run while the driver is offline.** In the dispatcher tab, select one of VEH011's later stops and choose **Defer order**. After ~2 minutes, Live tracking shows VEH011 as *No signal*.
11. **Driver: reconnect.** Turn **No signal** off. The queued records sync with their original times, and the driver sees *"Your run was changed by dispatch — Removed: …"*. A code that didn't match when the server checked it would raise a *delivery code didn't match* warning for dispatch.
12. **Store: confirm receipt.** Use the tab of the branch you delivered to in step 8 (signed in as its manager, e.g. `store-out010` for `OUT010 Mount Lavinia` on the shared dataset). The order shows **Delivered** and the shortfall notice. Click **Confirm receipt**. Under **Check what arrived**, each item shows how many the driver delivered: lower the first stepper for items that did not arrive, and use the *Damaged* stepper for items that arrived damaged. Add a note, optionally add photos for dispatch, and confirm. The dispatcher gets a *receipt issue* exception.
13. **Dispatcher: see the evidence.** Back in the dispatcher tab:
    - **Live tracking** shows the phones' positions on a map (VEH011 appears once the driver has shared a location) and, on the exception card, the proof for that stop: whether the code matched, the signature, the driver's photos and the store's receipt with what was missing or damaged.
    - **Deliveries** lists every stop reached, with its code check and photos. Filter by *Needs a look* or *Awaiting receipt*, and open a row for the store's code, the driver's proof and the store's receipt side by side.
14. **Plan ahead.** **Capacity outlook** shows the 10-week volume by brand against practical capacity, the refrigerated vehicles needed, and the ×2 peak-day factor. The tag in the header says whether the forecast weeks come from the baseline or the Datathon Task 2A model. **Deferrals** shows each outlet's 14-day service strip and the audit log (CSV export).
15. **HR: look after the people.** Open http://localhost:3001 (Waypoint People) and sign in as `admin`, the HR officer.
    - **Front desk** shows what needs HR today: driving licences due in the next 90 days, who is on leave and when they're back, and staff who can't sign in yet.
    - **Staff directory** holds one folder per employee in every job (drivers, loaders, dispatchers, store managers, HR). Pull a driver's folder and use **Issue login** on the Sign-in access card. The username and a generated password are ready to share. Sign in with them in the operations app: you land on the vehicle dispatch assigned.
    - **Renewals** files every driving licence under the month it runs out. **Activity log** is HR's logbook of record changes, logins and sign-ins.
    - Staff beyond the named demo accounts (loaders, dispatchers, store managers, a second HR officer) are **synthetic demo records**. Every branch's manager, one Kandy loader and one Kandy driver already have a login (see [Accounts](#accounts)).
16. **Dispatch: keep the network true.** In the dispatcher tab, **Network records** holds vehicles (and which driver runs each), branches, depots, products and the demo-day reset.

## How the planner decides (short version)

- **Hard rules** (never broken): one brand and one district per trip; refrigerated for chilled; vans for van-only; home depot only; weight and volume; at most 2 trips; Fresh ≤ 270 min and Style/Tech ≤ 480 min (Task 2B trip-time formula); the outlet's delivery window (mall windows included); weekly fuel quota.
- **Order of allocation:** scarce vehicles first (chilled van-only → reefer vans, chilled → reefers, ambient van-only → vans, then the rest). Within each group, **outlets skipped yesterday go first**. Then the engine repeatedly fills the trip that serves the most priority per vehicle-minute.
- **Priority score (shown in the UI):** skipped yesterday +30 · chilled +20 · days since served · Fresh daily +10 · festival ramp · tight or mall window.
- **Road conditions:** each district's disruption index for the plan date (`road_conditions.csv`, 100 = normal) stretches its travel legs by 100 ÷ index. Dock handling time is not affected. Trips with an index below 95 show the stretch on the plan board. In the route-leg history, actual vs planned leg times follow this ratio closely.
- **Live watch:** every 30 seconds the API compares each run with its plan. A driver who stays at a stop longer than its expected handling time plus 10 minutes raises a *dwell* alert for dispatch. A store whose stop is projected 5 or more minutes past its window gets a *late* notice with the new time, and can answer that it still works or ask dispatch for a smaller drop. Projections move only on real driver records, so a dead zone never makes a vehicle look late by itself.
- **Deferral reasons** come from the rule that actually blocked every candidate vehicle. On the shared dataset's demo day the auto-plan defers 14 orders: 13 chilled orders (refrigerated capacity and Fresh windows run out; S1-016 is deferred because of the road disruption stretch) and one Style order (40.7 m³, larger than any available vehicle, so it can never be served whole).

## Datathon models (optional)

The Datathon models plug in through a separate Python service, `apps/models`. Until they are added, the app uses transparent baselines: the service allowance for handling time, ETA vs window close for late risk, and a 6-week mean with festival uplift for the forecast.

1. Put the trained files in `apps/models/artifacts/` (`task1_service.joblib`, `task1_late.joblib`, `task2a_forecast.joblib`). Then fill in the feature functions in `apps/models/predict.py`, unless the saved models are full scikit-learn Pipelines.
2. Start it:
   - Docker: `MODEL_URL=http://models:8000 docker compose --profile models up --build`.
   - Locally: `python3 apps/models/server.py`, with `MODEL_URL=http://localhost:8000` for the API.
3. Check **GET /api/models**, or the source tag on Live tracking and Capacity outlook. Each task switches from `baseline` to `model` independently.

Where each prediction is used, and the request format, are in [`docs/INTEGRATION.md → Datathon hooks`](docs/INTEGRATION.md#datathon-hooks).

## Departures from the Designathon design

- The demo date is **18 Dec 2025 (pre-Christmas)** instead of the Figma's Nov 2026 Deepavali example. The calendar data ends in June 2026, and this date matches scenario S1.
- Districts, outlets and vehicles use the **real dataset values** (e.g. Galle, Matara, Puttalam; VEH011), replacing the Figma placeholders. Outlet display names are fictional neighbourhoods assigned deterministically.
- **Delivery windows are a hard rule** in the app (the Figma showed late arrivals as warnings). Second Fresh trips must still reach stores before their windows close.
- The driver's run map and the dispatcher's fleet map use **OpenStreetMap tiles** (no API key). Offline, the driver's pins still show and the map says the tiles are unavailable.
- **Field proof (3 Oct), added after the Designathon:** a 6-digit delivery code per order that the store reads out and the driver enters, photos from the loader, driver and store, the driver phone's location and connectivity log, the live watch (dwell alerts and late notices), itemised receipts (missing and damaged counts), and a dispatcher **Deliveries** page.
- Demo convenience not in the design: the per-tab *No signal* switch.
- **Store managers sign in to their own branch (4 Oct):** there is no branch switcher; each branch's manager has their own login.
- The product is now called **DASH** (the Designathon file used "Waypoint Delivery Planning"). Waypoint Group, its brands (Waypoint Fresh, Style and Tech) and the HR panel (Waypoint People) keep their names.
- **Blue-only palette (1 Oct):** the Designathon file's teal actions and green success/Fresh colours are replaced by one blue family (cobalt actions, deep-blue success, glacier-blue chilled, azure/ultramarine/midnight brands). Only alerts keep red and amber.
- **DASH branding & visual identity:** Operations app rebranded to DASH with high-resolution brand marks (`DASH.png` / `DASH W.png`), balanced 50/50 desktop sign-in split, and responsive white brand marks on dark surfaces.
- **Loader phone app (3 Oct):** the dock screens are a phone app like the driver's: bottom tabs (Queue · Flags · More), a cab-to-door truck strip, big tick targets, and checklist ticks saved on the phone first so a dead spot in the cold store loses nothing. Flagging and release need a connection and send any pending ticks first. **Flags** lists every shortfall with the dispatcher's decision, re-picks first. Dark mode (header sun/moon, or Dark / Light / System under **More**) follows the phone by default and is kept separately from the driver's choice.
- **Driver Dark Mode:** Dedicated dark theme designed for cab ergonomics, dawn runs, and night shifts (`#090e17`), with automatic Leaflet tile brightness/contrast inversion, dynamic canvas signature ink contrast, and system preference sync.
- **Mobile Dark Mode Sign-in:** Automatic dark theme on mobile viewports for low-light early morning sign-ins, with mobile notch/status bar tinting.
- **Road disruption stretching in trip timing:** Travel legs dynamically stretched by `100 / index` using `road_conditions.csv` disruption metrics.
- Added after the Designathon: Waypoint People (the HR panel, with a staff directory for every role), real sign-in with HR-issued credentials, dispatch-owned network records, and the Postgres-backed API.

## Datasets and confidentiality

The competition terms forbid publishing the datasets or their derivatives. `data/` and the generated `packages/core/src/seed.json` are therefore **git-ignored**, as is the local database in `.data/`. A public fresh clone boots with an independently generated synthetic fixture that follows the booklet's published network counts and reproduces the peak-day shape (refrigerated capacity binds), so `npm test`, `npm run dev`, `docker compose up` and the judge walkthrough all work without the private data. **The judged build must use the shared dataset:** place the organisers' CSVs in `data/General Data/`, `data/Training Data/`, and `data/Test Data/` before `npm run dev` or `docker compose up --build`. Do not publish the private seed or a Docker image containing it without organiser authorization.

## More

- Plan and screen map: [`docs/PLAN.md`](docs/PLAN.md)
- Demo script (the cross-role story): [`docs/DEMO.md`](docs/DEMO.md)
- API endpoints, data model and Datathon hooks: [`docs/INTEGRATION.md`](docs/INTEGRATION.md)
- Architecture and data model: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- AI tool disclosure: [`docs/AI-DISCLOSURE.md`](docs/AI-DISCLOSURE.md)
