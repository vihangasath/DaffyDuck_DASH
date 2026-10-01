# AI tool disclosure

We used **Claude (Anthropic) through Claude Code** and **OpenAI Codex** as pair-programmers and design assistants. This page will be updated as the phases progress.

## AI-assisted work

- **Understanding the brief and the domain.** Reading the challenge booklet, a first pass of domain research (dispatch systems such as Onfleet, OptimoRoute, Routific, Locus and FarEye; offline-first PWA patterns; the Sri Lankan festival and monsoon calendar), and drafting `docs/PLAN.md`.
- **Designathon file.** Generating the Figma file (tokens, role screens, rationale text) through the Figma MCP from scripts in `design/figma-build/`. The team reviews and edits the output.
- **Frontend build.** Scaffolding and most first-draft code for the Next.js app, the planning engine, the mock API, the offline driver outbox, the seed script and the tests.
- **Visual refresh (26 Sep).** Evolving the UI within the existing navy + teal identity (shared UI kit, sign-in, all four roles) and the driver's run map.
- **Backend and admin console (26 Sep).** Most first-draft code for the API service (`apps/api`: schema, migrations, seeding, auth and sessions, role checks, audit log, live events), the move of the business rules from the browser mock into `packages/core`, the admin console (`apps/admin`), and the API tests.
- **Waypoint People, the HR panel (27 Sep).** Turning the admin console into a separate HR product: the `staff` table and its seed, the `/api/people` and `/api/network` routes (split from the old admin routes), moving vehicles, branches, depots, products and the demo reset into the dispatch console, and the new "personnel file cabinet" interface for `apps/admin`.
- **Documentation.** First drafts of the README, the integration contract and the architecture notes.
- **Hackathon backend hardening (30 Sep, Codex).** Reviewing the booklet against the existing stack; tightening order, plan, loading, driver-sync and receipt rules; extending the API walkthrough tests; and adding an independently generated public demo seed that keeps the private competition data out of the repository.
- **Hackathon review (1 Oct, Claude Code).** Reviewing the build against the booklet and on a fresh clone. Fixes: each role now reads only its own slice of the operational state; the driver app shows records the server refused instead of retrying them forever; the synthetic public seed reproduces the peak day (refrigerated capacity binds); typechecking works on a fresh clone; restored Waypoint brand names after the DASH rename; the ER diagram in `ARCHITECTURE.md`.

## Decisions made by the team

- Scope and priorities: frontend first, then (26 Sep) a relational database for everything, a separate admin console, credentials issued by administrators, and embedded Postgres for local development; the stack; auto-plan + dispatcher override as the allocation approach.
- (27 Sep) The admin panel belongs to the HR department, not logistics: people only, a staff directory for every role, HR officers as its users, and the name "Waypoint People". The team chose the personnel-file-cabinet visual direction from the options offered.
- Review and acceptance of the design direction, planning rules, fairness policy and demo scenario.
- *(Team: list here what you wrote or changed by hand, and how you verified the AI's output.)*

## How outputs were checked

- The planner is covered by automated tests that re-check every Task 2B feasibility rule on the real peak-day data (`npm test`).
- The API is covered by tests that run the walkthrough over HTTP against a real (in-memory) Postgres: role checks, idempotent driver sync, the audit trail, and state that reloads identically from the tables.
- Every screen was exercised end-to-end in a browser across all four roles, including the offline and conflict scenario.
- The AI assistant read samples of the competition CSVs while building the seed script and planner (for example header rows and summary statistics). The datasets were not uploaded to any other service.

The 30 Sep backend edits were syntax-checked with esbuild. The independent synthetic peak day passed the pure planner for both depots with zero feasibility violations. An isolated business-rules walkthrough covered ordering, loading, offline delivery reconciliation and receipt, plus refusal of held-load release and an out-of-run driver event.

On 1 Oct the full suites (`npm test`, `npm run typecheck`, `npm run lint`) and both production builds were run on the private seed and again on a fresh clone with the synthetic seed. The role screens were checked in a browser, including the driver and loader at phone width.
