# Changelog: Waypoint Delivery Planning · Team Daffy Duck

What has been built so far for Tech-Triathlon 2026, in order. Deadlines: Designathon 29 Sep, Hackathon 4 Oct, Datathon 9 Oct 2026. Dates below are 2026.

## 25 Sep: Plan and the Designathon file
- **Plan.** We read the challenge brief and did domain research: Onfleet, OptimoRoute, Routific, Locus and FarEye; offline-first PWAs; the Sri Lankan festival and monsoon calendar. The result is [`PLAN.md`](PLAN.md).
- **Decisions.** Stack: Next.js + Postgres. Allocation: an auto-planner that the dispatcher can override. Design and build go together.
- **Figma file** ("Waypoint Delivery Planning · Designathon"), built from the scripts in [`design/figma-build/`](../design/figma-build/). The scripts ran through the Figma MCP until the Starter plan's call limit stopped them; the rest were built in a second account's handoff file.
  - Page 01 · Overview: cover, problem framing and scope, personas, the cross-role workflow, foundations.
  - Page 02 · Screens by role: Dispatcher D1–D6, Loader L1–L3, Driver R1–R5, Store S1–S4, each with its rationale.
  - Page 03 · Degradation: the driver-offline scenario (DG1–DG3), the dispatcher offline view (DG4), store ETA uncertainty (DG5), short on the dock and the re-plan (DG6).
  - Colour variables: `Waypoint / Color`, 34 tokens.

## 26 Sep: Full stack, admin console, visual refresh
- **Everything in a relational database.** Postgres, embedded as PGlite in development and Postgres 17 in Docker, stores depots, branches, vehicles, drivers, products, accounts, orders, plans, loading, deliveries, receipts and the audit log.
- **API** (`apps/api`, Hono + Drizzle): the only process that writes to the database.
  - Business rules live in `packages/core` and are shared by the API and the apps.
  - Role checks sit next to each rule, and every write is audited.
  - Live updates go out over Server-Sent Events.
  - Driver sync is idempotent.
- **Real sign-in.** Administrators issue the credentials; there are no one-click demo cards. Each login lands on its own workspace.
- **Admin console** (`apps/admin`): drivers, vehicles, branches, depots, products, accounts, operations and the activity log.
- **Visual refresh** of the operations app. It evolves the navy + teal identity rather than replacing it. New tokens: `mint`, `navy-3`, `primary-bright` and shadows; `muted` was darkened to `#64717f` for contrast. The pre-refresh copy is in `.design-backup-2026-09-26/`.
- **Figma merge.** The handoff file's pages were merged back into the main file, and 1,451 fills were reconnected to the main file's tokens.

## 27 Sep: The admin console becomes the HR department's panel
### Fixes
- **Hydration warning.** Browser extensions such as Grammarly add attributes to `<body>` before React hydrates. `suppressHydrationWarning` on `<body>` in both apps silences that; it affects only that element's attributes.

### Waypoint People (HR), in `apps/admin`
- **Why.** People records and sign-in access are HR's job, not logistics. The admin console is now a separate product for HR officers, with its own name, sign-in and look.
- **Features**
  - **Front desk:** a register line of the day's counts, the licence tickler, who is on leave (with return dates), who can't sign in yet, new starters, a depot-by-job table and the logbook.
  - **Staff directory:** one folder per person in every job (driver, loader, dispatcher, store manager, HR officer), with A–Z guide cards.
    - An open folder holds four cards: personal record, job and status (active, on leave with a return date, or left), driving licence, and sign-in access.
    - Logins are issued, reset and turned off from the folder.
  - **Renewals:** a tickler file of driving licences by expiry month, with expired ones first.
  - **Sign-in access:** a ledger of every login and where it lands.
  - **Activity log:** HR entries only (staff records, logins, sign-ins).
  - **Settings:** change your own password.
- **Rules**
  - Every login belongs to exactly one staff record, and its role and workplace come from that record.
  - Marking someone as "left" turns off their login and ends their sessions. A driver who leaves, or changes depot, gives their vehicle back to dispatch.
  - HR can't remove their own access or the last HR login.
  - Licences and leave use the real calendar. Operations use the demo day.
- **Data**
  - A new `staff` table, and `users.staffId`.
  - A seed of 194 synthetic people. `staff.synthetic` marks them and the UI labels them. The five demo accounts are linked.
  - Migrations `0001_people` and `0002_staff_synthetic`. Existing databases are filled in once on start-up.
- **Visual world: a personnel file cabinet.** Chosen from a direction round.
  - Colour: cabinet-green rail, brass label holders, enamel ground, manila folders.
  - Content: index cards with a red header rule and feint lines, and rubber stamps for exceptions only (ON LEAVE, LEFT, EXPIRED).
  - Job signal tabs in five colours.
  - Type: Archivo (with its width axis) and Courier Prime for typed record data only.
  - The system is documented in [`apps/admin/DESIGN.md`](../apps/admin/DESIGN.md), and the product record in [`apps/admin/PRODUCT.md`](../apps/admin/PRODUCT.md).
- **Quality.** An independent finish review ran over desktop and mobile captures. The build shipped after 8 material fixes:
  - labelling synthetic data;
  - replacing the KPI tiles with a register line;
  - correcting the depot table's counts;
  - fixing clipped tabs and tables;
  - consistent index-card rules;
  - select chevrons;
  - brass label holders;
  - log hygiene (collapsing repeats, renaming legacy entries).
  - The Activity log, Settings and Sign-in pages have not been reviewed yet.

### Operations app (`apps/web`)
- **Network records.** The dispatch console gets a new sidebar group: **Vehicles** (with driver assignment), **Branches**, **Depots**, **Products** and **Demo day** (the reset). These moved out of the old admin console.
- **Wording.** Copy now points to HR and Waypoint People instead of "your administrator" or "the admin console".

### API (`apps/api`)
- `/api/admin` is replaced by `/api/people`, for HR, and `/api/network`, for dispatchers. See [`INTEGRATION.md`](INTEGRATION.md).
- Tests (15 passing) cover:
  - staff records for every role;
  - issuing a login and assigning a vehicle;
  - access being removed when someone leaves;
  - HR not being able to lock themselves out;
  - the HR log not including operations events.
- Fixed a seed bug that gave some synthetic phone numbers a minus sign.

### Shared packages
- `packages/core/src/people.ts`: HR types. `packages/core/src/records.ts`: network record types. `packages/core/src/admin.ts` was removed.
- `packages/ui/src/kit.tsx`: the table, drawer and form kit moved here from the admin app, for the dispatcher screens.

### Figma
The update was built in the handoff file https://www.figma.com/design/r9F06rr0rdzxTXAmT2qbFg, because the main file isn't shared with that account. Copy the sections into the main file.
- **Colour variables**
  - `Waypoint / Color` now matches the frontend: `text/muted` is `#64717f`, and `accent/mint`, `accent/primary-bright` and `bg/ink-3` were added (37 tokens).
  - New collection: `Waypoint People / Color` (33 `people/*` tokens).
- **Page 02 · Screens by role**
  - All dispatcher sidebars (D1–D6) have the "Today's run" and "Network records" groups.
  - New section **Dispatch · Network records**: D7 · Vehicles, with the driver drawer.
  - New section **HR · Waypoint People**: a foundations board, P0 Sign in, P1 Front desk, P2 Staff directory with an open folder, P3 Renewals, P4 Sign-in access, and P5 the folder on a phone.
- **Page 01 · Overview:** a change-log board with this timeline.
- **Tooling.** The scripts are `design/figma-build/08–10`. `compose.mjs` bundles them into `dist/` and into a local Figma plugin, `waypoint-hr-update-plugin.zip`, for running them without MCP calls.

### Branch
The code changes are on `feat/hr-waypoint-people`. The PR still needs to be opened (the `gh` CLI isn't installed on this machine).

## 1 Oct: Hackathon review against the booklet
A pass over the build as a judge would see it: the booklet's Hackathon requirements, a fresh clone, and every role in a browser (driver and loader at phone width).
- **Each role reads only its own data.** `GET /api/ops/snapshot` used to send every order, notice, POD and exception to every signed-in user. It now sends dispatchers everything, loaders their depot, drivers their vehicle and store managers their outlets (`visibleTo` in `packages/core/src/ops.ts`).
- **Refused driver records are shown, not retried forever.** A record the server refuses for good (for example, a stop already recorded) moves to **Not accepted** on the driver's Outbox with the reason, and the Outbox tab badge turns red. Records waiting for the loader to release the trip stay queued.
- **A fresh clone works.** The synthetic public seed now reproduces the peak day (chilled demand about 17% over refrigerated capacity), so `npm test` passes without the private data, and `npm run typecheck` generates Next.js route types first. The README walkthrough no longer depends on ids or numbers that exist only in the shared dataset.
- **Naming.** DASH is the product; Waypoint Group's brands (Waypoint Fresh, Style, Tech) and Waypoint People had been renamed by mistake and are restored. The rename is listed as a departure from the Designathon design.
- **Docs.** An ER diagram and a "who can read what" table in [`ARCHITECTURE.md`](ARCHITECTURE.md); sync rules updated in [`INTEGRATION.md`](INTEGRATION.md). `.dockerignore` now keeps `.env`, docs and design files out of the image.
- Tests: 15 planner + 19 API, passing on both seeds.
