# Figma build scripts: Waypoint Designathon file

File: https://www.figma.com/design/l9HWFHRoAH1WCMHCJOxKl3 (team "Vihanga Sathsara's Team", Starter plan)

Each script is Figma Plugin API code, run through the Figma MCP `use_figma` tool (or pasted into a scripting plugin such as "Scripter").
Scripts 01–07 load the shared helper library from a hidden, locked text node, `4:2` ("__build-helpers (temporary, delete)"), on the first page.
`00-helpers.js` is the same library in source form. If node `4:2` is ever lost, recreate it from this file.

## Status (25 Sep 2026)
| Done | What |
|---|---|
| ✅ | Color variables (`Waypoint / Color`, 34 tokens) |
| ✅ | Page 02: Dispatcher D1–D6, Loader L1–L3 (L2m), Driver R1–R5, Store S1–S4, each with its rationale |
| ✅ `01-fixes.js` (applied in handoff file via `01-fixes-by-name.js`) | Small layout fixes (D2 trip headers wrap, D5 label overlap, L2m overflow) |
| ✅ `02-cover-framing.js` (in handoff file) | Page 01: cover + problem framing, scope and core tradeoff |
| ✅ `03-personas.js` (in handoff file) | Page 01: four personas |
| ✅ `04-flow-foundations.js` (in handoff file) | Page 01: cross-role workflow swimlane + foundations/style guide |
| ✅ `05-dg-driver.js` (in handoff file) | Page 03: Scenario 1 brief + DG1–DG3 (driver offline) + sync rules |
| ✅ `06-dg-dispatch-store.js` (in handoff file) | Page 03: DG4 dispatcher offline view + DG5 store ETA uncertain |
| ✅ `07-dg-dock.js` (in handoff file) | Page 03: Scenario 2 "Short on the dock" + DG6 re-plan modal |

Scripts 02–07 were blocked by the Starter plan's MCP tool-call limit. Scripts 02–07 are independent of each other and can run in parallel.
Node `4:2` was deleted after the build (26 Sep 2026). To run a script again, first recreate it from `00-helpers.js`.

Starter plan limits we hit: max **3 pages** (we use 3), plus an MCP tool-call cap.

## Handoff file (25 Sep 2026)
The old account ran out of MCP calls, so scripts 02–07 were built in a second account (`sathsarawmv.23@uom.lk`, draft):
https://www.figma.com/design/r9F06rr0rdzxTXAmT2qbFg
- `01 · Overview`: Cover, Problem framing & scope, Personas, Cross-role workflow, Foundations & style guide
- `03 · Degradation`: the three scenario sections (DG1–DG6)
- The file has its own `Waypoint / Color` collection (same 34 token names). Values come from `apps/web/src/app/globals.css`.
- Small fixes applied after the build: table cells now wrap, the Foundations input fields have a fixed width, and the DG4 map pills were moved.
- `02 · Screens by role`: D2, D5 and L2m, copied in from the old file and fixed there with `01-fixes-by-name.js`. D5 also got two extra changes: the capacity label moved to x=152, y=12 (clear of the W50 bar) and the capacity line was extended to W53.
- ✅ Merged back on 26 Sep 2026. Everything was pasted into the main file, and 1,451 fills that still pointed at the handoff file's tokens were reconnected by name to the main file's `Waypoint / Color` tokens. The audit found 0 fills still pointing elsewhere, and node `4:2` was deleted. The handoff file is no longer needed.
