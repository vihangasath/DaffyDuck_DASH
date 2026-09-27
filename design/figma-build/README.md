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

## HR split update (27 Sep 2026): ✅ applied in the handoff file
Applied on 27 Sep through MCP to https://www.figma.com/design/r9F06rr0rdzxTXAmT2qbFg (student plan, full seat). The main file isn't shared with that account, so copy the new sections across. The token sync is also done there: `text/muted` is `#64717f`, and `accent/mint`, `accent/primary-bright` and `bg/ink-3` were added. Page 01 has a change-log board. The temporary helper nodes were deleted.

The admin console became **Waypoint People**, the HR department's panel, and its logistics records moved to dispatch (see `apps/admin/DESIGN.md` and `docs/INTEGRATION.md`). These scripts bring the Figma file up to date:

| Status | Script | What it does |
|---|---|---|
| ✅ | `08-network-records.src.js` | Page 02: adds "Today's run" and "Network records" groups (Vehicles, Branches, Depots, Products, Demo day) to every dispatcher sidebar (D1–D6). Adds a new section with **D7 · Vehicles**, which has the vehicle drawer where dispatch assigns the driver |
| ✅ | `09-people-a.src.js` | Page 02: creates the `Waypoint People / Color` variable collection (33 `people/*` tokens) and a new section **HR · Waypoint People** with a foundations board, **P0 Sign in** and **P1 Front desk** |
| ✅ | `10-people-b.src.js` | Same section: **P2 Staff directory** with the pulled folder, **P3 Renewals** tickler, **P4 Sign-in access**, and **P5** the folder on a phone. Run it after 09 |

- They don't need helper node `4:2`. `node compose.mjs` bundles `00-helpers.js` and `00-people-helpers.js` into each script under `dist/`, so each script is a single self-contained `use_figma` call (3 calls in total, Starter-plan friendly).
- Scripts 09 and 10 can be run again safely (they replace their own section or part). Script 08 skips sidebars that already have the Network records group.
- Fonts: Archivo, Archivo Narrow and Courier Prime (Google fonts in Figma). If one can't be loaded, the script falls back to Inter.
- People data in the frames is synthetic demo data, as in the app.

### Running the HR update without MCP calls (Starter-plan limit)
**Easiest:** unzip `waypoint-hr-update-plugin.zip` and follow `HOW-TO-IMPORT.txt`. The plugin is self-contained and works in any file: it creates the colour variables and the page if they're missing. Rebuild it with `node compose.mjs` and re-zip after editing any script.

On 27 Sep the MCP tool-call limit was reached again partway through. `node compose.mjs` also builds a **local development plugin** that runs 08 → 09 → 10 in order, with no call limit:
1. Open the target file in the **Figma desktop app** (handoff drafts file `r9F06rr0rdzxTXAmT2qbFg`, or the main file).
2. Go to **Plugins → Development → Import plugin from manifest…** and choose `design/figma-build/plugin/manifest.json`.
3. Run **Plugins → Development → Waypoint HR update (27 Sep)**. When it finishes, it shows which steps it applied or where it stopped.

In the handoff file, one MCP call ran before the limit: it left a hidden, locked text node `__build-helpers (temporary, delete)` (id 16:2) on page 01. The plugin doesn't need it, so delete it.
