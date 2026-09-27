---
name: Waypoint People
description: HR's filing cabinet for Waypoint. One folder per employee, read on index cards, kept in green steel drawers.
colors:
  cabinet: "#2e4a3e"
  cabinet-2: "#3a5b4c"
  cabinet-3: "#22382e"
  on-cabinet: "#edf2ee"
  on-cabinet-muted: "#a8bbaf"
  brass: "#a88542"
  brass-2: "#dcc58f"
  brass-ink: "#5b4516"
  manila: "#e6cc8f"
  manila-2: "#f2e4bf"
  manila-edge: "#c3a35b"
  manila-ink: "#5d4714"
  card-red: "#cf4a3c"
  feint: "#b9cbe6"
  stamp-leave: "#9a5d0c"
  stamp-left: "#b3261e"
  job-driver: "#2f63a8"
  job-loader: "#b85a14"
  job-dispatcher: "#2f7a4a"
  job-store: "#7b4aa0"
  job-hr: "#3c423e"
  ink: "#1d2621"
  ink-2: "#46544b"
  muted: "#5a665e"
  canvas: "#e6eae3"
  surface: "#fffefa"
  subtle: "#eef1ec"
  well: "#dde2da"
  line: "#cfd6cc"
  line-strong: "#a9b4a7"
  focus: "#1f5fbf"
  success: "#2f6b45"
  danger-soft: "#f8e3df"
typography:
  display:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 92"
  headline:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 92"
  title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.06em"
    fontVariation: "'wdth' 87.5"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.06em"
    fontVariation: "'wdth' 87.5"
  stamp:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "0.08em"
    fontVariation: "'wdth' 75"
  typed:
    fontFamily: "Courier Prime, Courier New, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
    letterSpacing: "-0.025em"
  typed-count:
    fontFamily: "Courier Prime, Courier New, ui-monospace, monospace"
    fontSize: "22px"
    fontWeight: 700
rounded:
  holder: "1px"
  stamp: "2px"
  card: "3px"
  folder: "4px"
  folder-tab: "5px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  gutter: "20px"
  section: "28px"
  gutter-lg: "32px"
components:
  button-primary:
    backgroundColor: "{colors.cabinet}"
    textColor: "{colors.on-cabinet}"
    rounded: "{rounded.card}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.cabinet-3}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "0 16px"
    height: "40px"
  button-secondary-hover:
    backgroundColor: "{colors.subtle}"
  button-ghost:
    textColor: "{colors.cabinet}"
    rounded: "{rounded.card}"
    padding: "0 16px"
    height: "40px"
  button-ghost-hover:
    backgroundColor: "{colors.well}"
  button-danger:
    backgroundColor: "{colors.stamp-left}"
    textColor: "#ffffff"
    rounded: "{rounded.card}"
    padding: "0 16px"
    height: "40px"
  button-sm:
    padding: "0 12px"
    height: "32px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "0 12px"
    height: "40px"
  index-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "12px 16px 16px"
  index-card-header:
    textColor: "{colors.ink-2}"
    typography: "{typography.title}"
    padding: "0 16px"
    height: "44px"
  folder:
    backgroundColor: "{colors.manila-2}"
    textColor: "{colors.manila-ink}"
    rounded: "{rounded.folder}"
    padding: "24px"
  folder-tab:
    backgroundColor: "{colors.manila}"
    textColor: "{colors.manila-ink}"
    rounded: "{rounded.folder-tab}"
    padding: "8px 16px 0"
  divider-tab:
    backgroundColor: "{colors.well}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.folder}"
    padding: "8px 12px 6px"
  divider-tab-selected:
    backgroundColor: "{colors.manila}"
    textColor: "{colors.manila-ink}"
  sheet:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
  ledger-head:
    backgroundColor: "{colors.well}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    padding: "10px 12px"
  stamp-on-leave:
    textColor: "{colors.stamp-leave}"
    typography: "{typography.stamp}"
    rounded: "{rounded.stamp}"
  stamp-left:
    textColor: "{colors.stamp-left}"
    typography: "{typography.stamp}"
    rounded: "{rounded.stamp}"
  drawer-front:
    backgroundColor: "{colors.cabinet-3}"
    rounded: "{rounded.card}"
    padding: "12px 12px 12px 20px"
  drawer-front-open:
    backgroundColor: "{colors.cabinet-2}"
  brass-holder:
    backgroundColor: "{colors.brass}"
    rounded: "{rounded.stamp}"
    padding: "3px"
  brass-holder-open:
    backgroundColor: "{colors.brass-2}"
    textColor: "{colors.manila-ink}"
  job-tab:
    rounded: "{rounded.stamp}"
    width: "10px"
    height: "14px"
---

# Design System: Waypoint People

## Overview

**Creative North Star: "The Personnel File Cabinet"**

Waypoint People is HR's filing cabinet. Every employee is one folder; every question about a person is answered by pulling that folder and reading the cards inside. The ground is steel-cabinet enamel: a pale, cool green-grey page and deep office-green drawer fronts, never paper and never cream. Record content is written on white index cards with a red header rule and blue feint lines. Manila appears where something is open, chosen or filed. Exceptions are rubber-stamped; normal is unmarked.

The panel is dense and desk-bound, built for an officer scanning a register at 1280 to 1600 wide, and it folds cleanly to phone width. Every surface is a physical office object with a job: drawer fronts are navigation, brass label holders name the drawers, hanging-file signal tabs colour-code the job, index dividers filter, a ledger lists, a folder holds one person. Depth is short and low, like card stock on steel. Motion is limited to the drawer sliding out and the folder's cards coming up.

The world explicitly rejects the white SaaS dashboard (avatar grids, KPI tiles, purple accents) and the navy-and-teal logistics console of the sibling operations app. Shared components from the workspace UI package (toast, spinner) are pulled into this world by re-valuing the shared token names, never by restyling them per screen.

**Key Characteristics:**
- Steel enamel ground, office-green cabinet rail, white index cards, manila for the open record.
- Archivo on its width axis: semi-condensed caps for labels, normal width for reading.
- Courier Prime only for typed record data (IDs, dates, licence numbers, usernames, counts in the register).
- Rubber stamps for exceptions only; active people carry no mark.
- Job signal tabs in five fixed colours.
- Corners of 1 to 5px; nothing pill-shaped, nothing soft.

## Colors

A cool, low-chroma steel-and-green ground with warm manila and brass as the only warmth, and small, saturated signal colours for job and exception.

### Primary
- **Cabinet Green** (cabinet): the drawer fronts of the rail, the sign-in ground, the primary button, text links and the caret. This is the brand's face; the favicon and theme colour use it.
- **Open Drawer Green** (cabinet-2): the drawer front that is pulled out (current page).
- **Drawer Shadow Green** (cabinet-3): closed drawer fronts (at 60%), primary button hover, hover wells on the rail.
- **Enamel Light** (on-cabinet) and **Enamel Muted** (on-cabinet-muted): text on the green rail and sign-in ground.

### Secondary
- **Manila Tab** (manila): folder tabs, the selected index divider, the current drawer's peeking tab, the unfiled-changes bar, text selection.
- **Manila Folder** (manila-2): the open folder's body, folder lists, row hover and focus in ledgers and lists (at 60%).
- **Manila Edge** (manila-edge): every manila border and fold line.
- **Manila Ink** (manila-ink): all text on manila.
- **Label Brass** (brass), **Polished Brass** (brass-2), **Brass Shadow** (brass-ink): the label holder frames and drawer pulls on the rail; brass-2 marks the open drawer. Brass lives only on the cabinet rail.

### Tertiary
- **Header Red** (card-red): the rule under an index card's printed header (at 80%). Never a fill, never text.
- **Feint Blue** (feint): the hairline under each form field row and each logbook line. Drawn per row so a line never runs through a label or a sentence.
- **Ochre Stamp** (stamp-leave): ON LEAVE stamps, "expires in N days" warnings, soon-due signal tabs, "No login".
- **Stamp Red** (stamp-left): LEFT and EXPIRED stamps, overdue signal tabs and counts, errors, the danger button, the "off" side of a rocker.
- **Job signal tabs**: Driver Blue (job-driver), Loader Orange (job-loader), Dispatcher Green (job-dispatcher), Store Violet (job-store), HR Charcoal (job-hr). One colour per job, everywhere a person appears.
- **Focus Blue** (focus): the 2px focus outline only.

### Neutral
- **Cabinet Ink** (ink): primary text.
- **Graphite** (ink-2): secondary text, card titles, column heads, dimmed rows.
- **Pencil** (muted): hints, placeholders, empty-state icons.
- **Steel Enamel** (canvas): the page ground behind everything.
- **Card Stock** (surface): index cards, sheets, inputs, secondary buttons.
- **Pale Enamel** (subtle): hover fills, table footers, disabled inputs.
- **Drawer Well** (well): recessed areas: table heads, unselected dividers, the directory's drawer, rocker tracks, skeleton loaders.
- **Hairline** (line) and **Steel Rule** (line-strong): borders on sheets and rows; line-strong on inputs, buttons and the register strip.
- **Filed Green** (success) and **Error Wash** (danger-soft): "On" / "Signed in now" and the error note ground.

### Named Rules

**The Manila Means Open Rule.** Manila marks the thing in hand: the open folder, the chosen divider, the current drawer, the hovered row, a filed list. A closed, unselected surface is never manila.

**The Shared Names, Local Values Rule.** Token names shared with the operations app (primary, danger, warning, info, success, navy, mint, on-ink-muted) are re-valued to cabinet colours in this app's stylesheet so shared components land in this world. New work in this app uses the cabinet names above, not the shared aliases.

**The Five Tabs Rule.** The five job colours are reserved for job identity. Do not reuse them for status, event kinds, charts or decoration.

## Typography

**Display Font:** Archivo (variable, with the wdth axis; fallback ui-sans-serif, system-ui)
**Body Font:** Archivo
**Label/Mono Font:** Courier Prime (fallback Courier New, ui-monospace) for typed record data only

**Character:** A single grotesque that changes width with its job: printed-label caps at 87.5% width, headings slightly condensed at 92%, reading text at normal width. Courier Prime is the typewriter that filled in the card.

### Hierarchy
- **Display** (700, 28px, 1.1, 92% width, -0.02em): page titles only, one per screen, in the page header.
- **Headline** (700, 18px, 92% width): section heads on a page (Licence tickler, Logbook), followed inline by a plain 14px description in graphite.
- **Title** (600, 12px, uppercase caps at 87.5% width, 0.06em): the printed header of an index card.
- **Body** (400, 14px): everything read: rows, field values, descriptions. Page sub-lines cap at 68ch.
- **Label** (600, 10.5 to 11.5px, uppercase caps at 87.5% width, 0.06em): field labels, column heads, drawer labels, folder tabs, job names.
- **Stamp** (800, 11px, uppercase at 75% width, 0.08em): rubber stamps only.
- **Typed** (Courier Prime 400, 12 to 13px, tight): IDs, dates, licence numbers, usernames, clock times. **Typed Count** (Courier Prime 700, 22px): the Front desk register numbers.

### Named Rules

**The Width Axis Rule.** Caps are made with Archivo's width axis plus a light 0.06em track, never with a second typeface. Reading text is always normal width.

**The Typewriter Rule.** Courier Prime is only for data a clerk would have typed onto the card. Names, sentences, buttons and headings are never in Courier.

**The Tabular Rule.** Tables and counts use tabular figures; numeric columns align right.

## Layout

A fixed cabinet rail on the left (248px, sticky, full height from the lg breakpoint of 1024px) and a fluid main area. Below lg the rail becomes a top band: wordmark with Settings and Sign out on the right, then a horizontally scrolling row of drawer fronts.

Page gutters are 20px, 32px from lg. The page header sits 28px from the top (36px at lg) with 20px below. Sections within a page are separated by a 28px gap. Cards pad 16px horizontally, with a 44px header band. Form fields stack with a 4px label gap and 12px below each feint rule. Ledger cells pad 10px by 12px, 16px at the outer edges.

The Front desk opens with a ruled register strip (steel rules above and below, typed counts linking to their drawers), then two columns from 1280px (about 1.55fr to 1fr, the narrow side at least 320px): the tickler cards on the wide side, folder lists on the narrow. The Staff directory pairs a drawer of folders on the left with the pulled folder on the right. Index dividers wrap onto a second row rather than scroll, so every divider stays findable.

## Elevation & Depth

Depth is card stock on steel: short, low shadows tinted with cabinet green, plus inset bevels on the green drawer fronts and the primary button. Recessed areas (the directory drawer, table heads) use the well colour and an inner shadow instead of lift.

### Shadow Vocabulary
- **Card** (`0 1px 1px rgb(34 56 46 / 0.08), 0 2px 6px -2px rgb(34 56 46 / 0.12)`): index cards, sheets, folder lists, the search box and secondary buttons.
- **Raised** (`0 2px 3px rgb(34 56 46 / 0.1), 0 10px 22px -10px rgb(34 56 46 / 0.3)`): the pulled folder and the selected folder in the drawer.
- **Float** (`0 10px 18px -6px rgb(34 56 46 / 0.22), 0 28px 56px -16px rgb(34 56 46 / 0.36)`): the sticky unfiled-changes bar and the sign-in folder.
- **Drawer** (`inset 0 1px 0 rgb(255 255 255 / 0.07), inset 0 -2px 0 rgb(0 0 0 / 0.22)`): every drawer front; the open drawer adds a soft drop below it.
- **Well** (`inset 0 2px 6px rgb(34 56 46 / 0.12)`): the recessed drawer that holds the directory's folders.

### Named Rules

**The Green Shadow Rule.** Shadows are tinted with cabinet green and stay short and blurred. No neutral grey glows, no hard offset shadows.

**The Pulled Forward Rule.** Lift means "in hand": only the open folder, the selected folder and floating action bars rise above card level.

## Shapes

Card stock and pressed steel: corners from 1 to 5px. Index cards, sheets, inputs and buttons use 3px; folders 4px; folder tabs and dividers round only their top corners (4 to 5px) and drop their bottom border so they join the surface below; stamps and signal tabs 2px; the card inside a brass holder 1px. The favicon's outer tile is the only larger radius.

Recurring silhouettes: the folder tab standing proud of a folder's top-left edge; the signal tab (10 by 14px, top-rounded, a dark inset at its base); the double-ruled stamp (2px border plus a 1px outline 2px out); the brass holder frame with a heavier lower lip.

## Components

### Buttons
Pressed steel, not pills.
- **Shape:** 3px corners; 40px tall, 16px sides (small: 32px, 12px sides, 13px text); 600 weight; a 16px Lucide icon leads when useful.
- **Primary:** cabinet green with a light top bevel and dark bottom lip (`inset 0 1px 0 rgb(255 255 255 / 0.1), inset 0 -2px 0 rgb(0 0 0 / 0.25)`); hover darkens to cabinet-3.
- **Secondary:** card stock with a steel-rule border and card shadow; hover shifts to pale enamel.
- **Ghost:** cabinet-green text; hover fills with the well colour.
- **Danger:** stamp red with a dark bottom lip; for withdrawing access and other destructive acts.
- **States:** busy swaps the icon for a spinner and disables; disabled is 50% opacity. Links that act as buttons take the same classes, never a button inside a link.

### Rubber Stamp (signature)
Exceptions only: ON LEAVE (ochre), LEFT and EXPIRED (red). Condensed 800-weight caps, 2px border plus 1px outline at 2px offset, rotated -3deg, multiply blend at 92% opacity so it reads as ink on card. Active people and valid licences carry no stamp.

### Job Signal Tab
A 10 by 14px coloured plastic tab with top-rounded corners, followed by the job name in label caps in the same colour; bare (tab only) in dense lists and tables.

### Cards / Containers
- **Index card:** card stock, 3px corners, card shadow, no border. A 44px printed header in title caps over a red rule (card-red at 80%); optional aside on the right for a stamp or due note. Content pads 12px top, 16px sides and bottom.
- **Sheet:** card stock, 3px, hairline border, card shadow; holds ledgers and plain content.
- **Folder list:** a manila tab (label caps plus count) standing at top-left over a manila-2 body with a manila-edge border; rows inside are card-stock strips separated by 1px gaps, hover to manila at 60%.
- **Pulled folder:** manila-2, 4px, manila-edge border, raised shadow, with a manila tab carrying the typed file number. Index cards stack inside it.
- **Tickler card:** an index card whose due state is a signal tab clipped to its top edge (red overdue, ochre soon); overdue cards span two columns.

### Inputs / Fields
- **Style:** 40px, card stock, steel-rule border, 3px corners, 12px sides, 14px text; typed inputs (IDs, dates, licence numbers, usernames) switch to Courier Prime.
- **Field:** label caps in graphite above, optional 12px hint below, the whole field ruled off with a feint blue line.
- **Focus:** border turns cabinet green with a 2px focus-blue outline at 1px offset. Global focus-visible is a 2px focus-blue outline at 2px offset.
- **Error / Disabled:** invalid turns the border stamp red; disabled uses the hairline border, pale enamel fill and graphite text. Error notes are an error-wash box with a stamp-red border at 30%.
- **Select:** the input style with a chevron at the right. **Search box:** the input style with a leading search icon, card shadow and clear button.
- **Rocker:** a two-sided switch in a well track (2px inner corners); the chosen side fills cabinet green for on, stamp red for off, and both sides say their word.

### Navigation
The cabinet rail. Each drawer front is a cabinet-3 panel (60%) with the drawer bevel, square on its left edge at lg, carrying a brass label holder (a brass frame with a darker lower lip, and a card in label caps slid inside, with a count on the right, red when something is overdue) and a brass pull bar on two posts. The current drawer is cabinet-2, slides out 8px (hover slides 4px) over 300ms on the expo ease-out, turns its holder to polished brass with a manila card, and shows a manila tab peeking above it. Settings and the signed-in officer sit at the foot, separated by a faint white rule.

### Index Dividers
Filter tabs you file behind: top-rounded tabs on a steel-rule baseline, well-coloured when idle; the chosen one steps forward 1px in manila with a manila-edge border. Counts sit beside labels, red and bold when they flag a problem.

### Ledger
The table: a sheet with a well-coloured head in label caps, sortable heads with an arrow, hairline row rules, 14px body, tabular numbers right-aligned. Clickable rows are keyboard-focusable and hover or focus to manila.

### Logbook
Ruled lines on feint blue: typed time (HH:MM today, otherwise day and month), a caps kind label, the summary with a ×N count for repeats, and the actor and role beneath.

### Motion
One ease: `cubic-bezier(0.16, 1, 0.3, 1)`. Pulling a folder raises its contents 14px from an already visible 0.4 opacity over 0.34s; the unfiled-changes bar rises 8px over 0.32s; drawers slide over 300ms. Every animation collapses to near-zero under reduced motion, and nothing depends on motion to be visible.

## Do's and Don'ts

### Do:
- **Do** put record content on white index cards with the red header rule and feint field lines.
- **Do** use manila for whatever is open, selected or filed, and only that.
- **Do** stamp exceptions (on leave, left, expired) and leave the normal state unmarked.
- **Do** mark every person with their job signal tab in the fixed five colours.
- **Do** set IDs, dates, licence numbers, usernames and register counts in Courier Prime; everything else in Archivo.
- **Do** make caps with Archivo's width axis (87.5%) and the 0.06em track.
- **Do** keep corners between 1 and 5px and tint shadows with cabinet green.
- **Do** theme shared components by re-valuing shared token names in this app's stylesheet.

### Don't:
- **Don't** build a white SaaS dashboard: no avatar grids, KPI tiles or purple accents.
- **Don't** borrow the operations app's navy and teal.
- **Don't** put an active person or a valid licence under a stamp, or use a stamp as decoration.
- **Don't** use the job colours for anything but job identity.
- **Don't** set names, sentences or buttons in Courier Prime.
- **Don't** use pill shapes, large radii or hard offset shadows.
- **Don't** make content depend on motion; the pulled folder starts visible.
