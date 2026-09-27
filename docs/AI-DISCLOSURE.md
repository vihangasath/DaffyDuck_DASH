# AI tool disclosure

We used **Claude (Anthropic) through Claude Code** as a pair-programmer and design assistant. This page will be updated as the phases progress.

## AI-assisted work

- **Understanding the brief and the domain.** Reading the challenge booklet, a first pass of domain research (dispatch systems such as Onfleet, OptimoRoute, Routific, Locus and FarEye; offline-first PWA patterns; the Sri Lankan festival and monsoon calendar), and drafting `docs/PLAN.md`.
- **Designathon file.** Generating the Figma file (tokens, role screens, rationale text) through the Figma MCP from scripts in `design/figma-build/`. The team reviews and edits the output.
- **Frontend build.** Scaffolding and most first-draft code for the Next.js app, the planning engine, the mock API, the offline driver outbox, the seed script and the tests.
- **Visual refresh (26 Sep).** Evolving the UI within the existing navy + teal identity (shared UI kit, sign-in, all four roles) and the driver's run map.
- **Backend and admin console (26 Sep).** Most first-draft code for the API service (`apps/api`: schema, migrations, seeding, auth and sessions, role checks, audit log, live events), the move of the business rules from the browser mock into `packages/core`, the admin console (`apps/admin`), and the API tests.
- **Documentation.** First drafts of the README, the integration contract and the architecture notes.

## Decisions made by the team

- Scope and priorities: frontend first, then (26 Sep) a relational database for everything, a separate admin console, credentials issued by administrators, and embedded Postgres for local development; the stack; auto-plan + dispatcher override as the allocation approach.
- Review and acceptance of the design direction, planning rules, fairness policy and demo scenario.
- *(Team: list here what you wrote or changed by hand, and how you verified the AI's output.)*

## How outputs were checked

- The planner is covered by automated tests that re-check every Task 2B feasibility rule on the real peak-day data (`npm test`).
- The API is covered by tests that run the walkthrough over HTTP against a real (in-memory) Postgres: role checks, idempotent driver sync, the audit trail, and state that reloads identically from the tables.
- Every screen was exercised end-to-end in a browser across all four roles, including the offline and conflict scenario.
- The AI assistant read samples of the competition CSVs while building the seed script and planner (for example header rows and summary statistics). The datasets were not uploaded to any other service.
