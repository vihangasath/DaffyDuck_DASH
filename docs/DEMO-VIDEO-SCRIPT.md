# DASH demo video: narration script (≈ 7:05)

Built on the click path in [`DEMO.md`](DEMO.md). Speech is written at a calm ~150 words per minute. Lines in *italics* are on-screen actions, not spoken.
Figures marked (shared dataset) only hold on the judged seed; record on that seed, or drop the numbers.

## Before you hit record

1. Run the shared-dataset stack. Dispatcher → **Network records → Demo day → Reset the demo day**.
2. Rehearse once with `npm run e2e`, then reset again (e2e leaves the day half-done).
3. Windows, all signed in (password `waypoint`): **A** `dispatcher` wide · **B** `loader` phone-size · **C** `driver` phone-size (open **More** once) · **D** a store manager, phone-size · **E** `admin` at :3001.
4. Do a dry run to learn which `OUT…` branch VEH011's first stop belongs to, so window D is already signed in as `store-out…` for that branch.
5. Record at 1080p. Zoom the browser to 110% so text is readable. Do not show the terminal.

---

## 0:00 – Opening (20 s)

*Sign-in screen of DASH, then cut to the dispatch console.*

> "Waypoint Group delivers fresh food, fashion and electronics to 120 branches. On a peak day, the orders don't fit in the trucks, and every hand-off between ordering, loading, driving and receiving is a place something gets lost. This is DASH: one system that connects all of it, for four roles, and keeps working when the signal doesn't."

## 0:20 – Dispatcher: plan the day (1:20)

*Window A, **Today**. Hover the Demand vs capacity card, then the watch list.*

> "I'm the dispatcher at Peliyagoda. It's the week before Christmas. Chilled demand is 182 cubic metres against 172 of refrigerated capacity (shared dataset), ten vehicles are in the workshop, and some outlets were skipped yesterday. We can't serve everything."

*Click **Close orders & auto-plan**. Open **Plan & allocate**; point at the **Limiting** tag.*

> "One click closes the 4 pm cutoff and plans the day. It marks refrigerated capacity as the limiting resource, and serves 71 of 85 orders (shared dataset). Every trip respects the hard rules from the brief: one brand and district per trip, refrigerated trucks for chilled goods, weight and volume, two trips per vehicle, trip-time limits, delivery windows and the weekly fuel quota."

*Click a deferred card, e.g. S1-075.*

> "Nothing is dropped silently. Each deferred order shows its priority score, days since served, chilled, window tightness, festival ramp, and the actual rule that blocked it, with a suggested fix and what happens if it's deferred again."

*Drag a chilled stop onto a dry-box trip. The target turns red; release; it's refused.*

> "I can override the plan by hand, but not break the rules. Drop a chilled stop on a dry truck and it turns red and tells me why. The server re-checks every move, so no client can get around it."

*Drag a stop onto a valid trip. Click **Publish to loaders**.*

> "A valid move lands. Now I publish, and the loaders' lists, the drivers' runs and the stores' notices are all created at once."

## 1:40 – Loader: last stop first (50 s)

*Window B, phone-size. Open VEH011.*

> "The loader has a phone app of their own. The checklist runs from the last stop to the first, so the first drop is at the tailgate. Ticks are saved on the phone before they're sent, so a dead spot in the cold store loses nothing."

*Tick all lines but one. **Flag shortfall**, enter the loaded quantity, **Send & release**.*

> "One line is short. I flag it with the real quantity and release the truck."

*Cut to window A, **Live tracking**.*

> "Dispatch sees 'released with shortfall' immediately. Vehicles that need attention sit at the top: held trucks, trips at risk of missing a window, and trucks that have gone quiet."

## 2:30 – Driver: proof of delivery (1:10)

*Window C, driver app in dark mode. Show the map, then tap **Arrived**.*

> "The driver follows the run on a map, in dark mode for dawn starts. 'Arrived' opens the stop, what to unload and how to reach the dock. The proof of delivery starts from what was actually loaded, not what was planned."

*Tap **Start delivery & POD**. Switch to window D, **Deliveries**, show the *Delivery code* card.*

> "Here's the part I'm proudest of. The store manager sees a six-digit code on the order and reads it out only when the goods are in front of them."

*Type a wrong code (refused), then the right one: "Code matches". Sign, receiver name, add a photo, **Complete delivery**.*

> "A wrong code is refused. The right one matches. Then a signature, the receiver's name and photos. Delivery confirmed, with evidence."

## 3:40 – Offline and recovery (1:20)

*Window C: **More → No signal**. Deliver the next stop. Show the Outbox "Queued", then reload.*

> "Now the Kadugannawa pass. No signal. The driver completes the next stop anyway. The phone can't check the code, so it says it'll be checked on sync, and the stop sits in the outbox as queued. Even after a reload, the whole run is still there."

*Window A: **Plan & allocate**, pick a later VEH011 stop, **Defer order**. Show Live tracking flag the vehicle as *No signal*.*

> "Meanwhile dispatch changes the run. After a couple of minutes, Live tracking flags the truck as having no signal, but it doesn't call it late. ETAs only move on real driver records, so a dead zone never makes a truck look late by itself."

*Window C: turn **No signal** off.*

> "Back in coverage. The queued stop syncs with its original timestamp, each record carries its own id so retries never duplicate, and the driver sees exactly what dispatch changed. A delivery made offline still counts, even though dispatch deferred that stop. And the server now checks the code: a wrong one raises a warning for dispatch."

## 5:00 – Store: close the loop (35 s)

*Window D: the order shows **Delivered**. **Confirm receipt**: lower *Arrived* on one item, raise *Damaged*, add a note.*

> "The store confirms what actually arrived: one item short, one damaged. That goes straight back to dispatch as an itemised exception."

*Window A: **Deliveries**, open the stop.*

> "And dispatch sees everything side by side: the code check, the signature, the driver's photos, and the store's count."

## 5:35 – HR and planning ahead (30 s)

*Window A: **Capacity outlook**, then window E (Waypoint People): Front desk, a staff folder, **Issue login**.*

> "Planning doesn't stop today: Capacity outlook looks ten weeks ahead against practical capacity. And HR has their own separate app, Waypoint People, with a folder for every employee, licence renewals and the logins that put each person on their own screen."

## 6:05 – What makes DASH different (35 s)

*Quick cuts, one per feature: delivery code card, photo on a Deliveries row, phone positions on the Live tracking map, the Connectivity & sync table, a store's "arriving in X min" countdown, the late-delivery notice.*

> "Most delivery tools stop at the plan. DASH carries the plan all the way to proof. A delivery isn't done until the store's own six-digit code, a signature and photos say it is, and the store's receipt counts what really arrived. Dispatch watches phone positions live, gets dwell alerts when a driver is stuck at a stop, and stores are told in advance if a truck will be late, and can answer. Every stop has an 'arriving in X minutes' countdown. Offline isn't an afterthought: loaders and drivers work with no signal, every record syncs exactly once, the phone's dead-zone history is logged, and a sync check confirms nothing was lost. The planner explains every order it defers and gives a fix. Every manual override is checked by the same rules on screen and on the server. And HR runs in a completely separate app, with every login tied to a real person's record."

## 6:40 – Close (25 s)

*Back to the dispatch console. Optionally flash the architecture diagram from `docs/ARCHITECTURE.md`.*

> "Under the hood: one API as the only database writer, a shared rules package so the planner and the checks are identical everywhere, 35 Postgres tables, role-scoped reads, an audit trail, and unit, API and end-to-end tests that pass on a fresh Docker clone. That's DASH: from order to receipt, every step planned, proven and recoverable. Thank you."

---

## Cutting for time

- **To ≈ 6 min:** shorten "What makes DASH different" to its first three sentences.
- **To ≈ 5 min:** also drop the HR/Capacity segment and shorten the opening.
- **To ≈ 3 min:** keep only Plan → Publish → Driver code POD → No signal → Store receipt.
- If the brief sets a hard limit, check it before recording.

## Hits the judging criteria

| Criterion | Where in the video |
|---|---|
| Functional completeness, four roles | Dispatcher, loader, driver, store segments |
| Planning engine | Plan, deferral reasons, rejected drag |
| Offline and recovery | 3:40 segment |
| Engineering quality | Closing paragraph |
| Creativity | Delivery code, photos, live watch, HR panel |
