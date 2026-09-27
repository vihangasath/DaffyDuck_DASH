---
version: 1
slug: "src-app"
primary_target: "src/app"
related_targets: []
---

# Waypoint People: the HR panel (apps/admin)

Scope: the whole panel (sign-in, Front desk, Staff directory, Renewals, Sign-in access, Activity log, Settings). Mode: **Operate**.

Audience and job: HR officers at a desk under office daylight. They keep one true record per employee across every role, keep drivers' licences valid, issue and withdraw sign-in access, and answer "who changed what". Success means spotting what needs action within seconds, then fixing it in one place. Logistics records are out of scope; they belong to dispatch in the operations app.

Constraints: works at 1280–1600 wide and down to phone width; WCAG AA; tables and forms fully usable by keyboard; synthetic demo people are labelled as such in the product copy where it matters.

## Direction contract

THESIS: Waypoint People is HR's filing cabinet. Every employee is one folder, and every question about a person is answered by pulling their folder and reading the cards inside. It refuses the category default of a white SaaS dashboard with avatar grids, KPI tiles and purple accents, and it looks nothing like the navy and teal logistics console.

OWN-WORLD: The ground is steel-cabinet enamel: cool office green drawer fronts (#2e4a3e) and a pale enamel page (#e6eae3), not paper and not cream. Manila (#e6cc8f tab, #f2e4bf folder) appears only where a record is open or filed. Record content sits on white index cards (#fffefa) with a red header rule and blue feint hairlines. Status is a rubber stamp in condensed caps, double-ruled and rotated −3°, used only for exceptions (ON LEAVE in ochre #9a5d0c, LEFT in red #b3261e); active people carry no stamp. Hanging-file signal tabs colour-code the job (driver blue, loader orange, dispatcher green, store manager violet, HR charcoal). Drawer names sit in brass label holders. Corners are 2–4px (card stock and steel). Type is Archivo, with semi-condensed caps for labels and normal width for reading. Courier Prime is used only for typed record data: IDs, dates and licence numbers.

STORY: The officer opens the cabinet and sees at the front desk who needs attention: licences in the tickler file, people on leave, people who can't sign in. They pull the person's folder, correct the card, issue or withdraw access, and file it back. Every change is written in the logbook.

FIRST VIEWPORT: Left, a 248px cabinet rail of drawer fronts, each with a brass label holder (Front desk, Staff directory, Renewals, Sign-in access, Activity log; Settings and the signed-in officer at the foot). The open drawer is pulled out and shows its manila tab. Main area, the Front desk:
- A ruled register strip of typed counts (in post, on leave, can't sign in, licences due in 90 days), each count linking to its drawer.
- Below that, two columns. The wider one is the renewals tickler: overdue licences on red-flagged index cards, larger than the rest. The narrower one holds folder-tab lists: on leave (with return dates) and can't sign in yet (each with "Issue login").
- The logbook of recent people and access events closes the page.
- Primary action: "Add a person", top right.

Signature interaction: pulling a folder. In the Staff directory, choosing a person lifts their tab and the manila folder opens, sliding the index cards up (about 300ms, expo ease-out, from an already-visible state; instant under reduced motion). Filing it back reverses the motion.

FORM: Personnel File Cabinet. It was the user's chosen card, IMPECCABLE'S PICK, position 1 on my ordered grounded list (the roll assigned position 3, The CR Book Register). Seed key 783a46d6. Build path: code-led (no image generation available).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
