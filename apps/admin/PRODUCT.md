# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## What it is

**Waypoint People** is the HR department's panel for the Waypoint company (Waypoint Fresh, Style and Tech). It lives in `apps/admin` and is a separate product from the logistics operations app (`apps/web`): its own name, sign-in and look. Both apps sit on the same Waypoint API and Postgres database.

Logistics master data (vehicles, depots, branches, products, the demo-day reset) is **not** managed here. It belongs to dispatchers in the operations app. Waypoint People manages people.

## Users and jobs

- **Primary user: HR officers** (seeded account: `admin`, Anjali Wickramasinghe). They sign in at a desk, usually on a laptop, during office hours.
- Their jobs:
  - Keep the **staff directory** true for every role: drivers, loaders, dispatchers, store managers and HR officers. That covers the home depot or branch, contact details, start date and status (active, on leave with a return date, or left).
  - Keep drivers road-legal: **driving licence number, class and expiry**, and chase renewals before they lapse.
  - Issue and control **sign-in access**: create a login for a staff member, reset passwords, disable access when someone leaves. A login routes each person to their own workspace in the operations app.
  - Answer "who did what, when" from the **activity log** (people, access and sign-in events).

## Product rules to preserve

- Every staff member has one staff record. At most one login is linked to it, and the login's role and workplace come from that record.
- Job roles map to app roles: driver → driver, loader → loader, dispatcher → dispatcher, store manager → store, HR officer → admin (internal key kept as `admin`).
- Setting someone to "left" disables their login and ends their sessions. You can't disable or demote your own account, and at least one active HR officer login must remain.
- Driver records also carry the operational link to a vehicle. Dispatchers assign vehicles; HR sees the assignment but doesn't change it.
- Licence renewals are checked against the real calendar. Operations use the demo day (Thu 18 Dec 2025).
- Every write is audited with the actor, role and a readable summary.

## Evidence and data truth

- Every seeded staff record, the five demo accounts included, is a **synthetic demo record** (the competition datasets don't identify people). `staff.synthetic` marks them and the UI labels them. Records HR adds are real.
- Seeded password for demo accounts is `waypoint` (listed in the README).

## Constraints

- Stack: Next.js 16 (App Router, webpack dev) + React 19 + Tailwind 4 + TanStack Query, in an npm-workspaces monorepo. API is Hono + Drizzle on Postgres (PGlite in dev).
- Runs on port 3001; the operations app is on 3000 and the API on 4000.
- Tech-Triathlon 2026 deadlines: Designathon 29 Sep, Hackathon 4 Oct, Datathon 9 Oct 2026.

## Accessibility

- WCAG AA contrast, full keyboard use of tables and drawers, visible focus, and screen-reader labels on icon-only controls.
