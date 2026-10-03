# Demo story: one delivery day across four roles

The cross-role loop is DASH's main differentiator, so we show it before judges go looking: **the dispatcher publishes a plan, the loader flags a shortfall, the driver completes a stop, and the dispatcher re-plans while the driver is offline.** Each change shows up live in the other tabs.

`e2e/walkthrough.spec.ts` runs this story end to end. If `npm run e2e` passes, the clicks below work on the seed you're using.

## Before you go on (5 min)

1. Run the stack the judges will see (`docker compose up --build` with the shared CSVs in `data/`), or `npm run dev`.
2. `npm run e2e`. It resets the demo day before it runs, so it is also the rehearsal.
3. **Reset again by hand:** dispatcher → **Network records → Demo day → Reset the demo day**. The e2e run leaves the day half-done.
4. Open four windows side by side, each signed in (password `waypoint`):

   | Window | Sign in as | Open at | Size |
   |---|---|---|---|
   | A | `dispatcher` | Today | wide |
   | B | `loader` | Dock queue | **phone** (DevTools device mode) |
   | C | `driver` | Run | **phone** (DevTools device mode, Pixel 7) |
   | D | `store` (for step 7, the stop's own branch: `store-out…`) | Deliveries | narrow |

   Sessions are per tab, so one browser is enough.
5. In the driver window, open **More** once. That screen holds the *No signal* switch.

## The story (≈ 6 min)

| # | Who | Do | Say |
|---|---|---|---|
| 1 | Dispatcher | **Close orders & auto-plan** | "Christmas week: chilled demand is above refrigerated capacity. The plan marks it *Limiting*." |
| 2 | Dispatcher | Point at the deferred queue, then click one | "Every order we can't take today shows its score on the card: days since served, perishable, window. Click for the reason and the suggested fix." |
| 3 | Dispatcher | Drag a chilled stop onto a dry-box trip | "The rules can't be broken by hand either. The drop turns red and says why." |
| 4 | Dispatcher | **Publish to loaders** | Window B fills with trips; window D's order moves to *Planned*. |
| 5 | Loader | Open **VEH011**. Tick every line but the last, then **Flag shortfall → Send & release** | "The loader has a phone app too. The load list runs last stop first; ticks are saved on the phone, so a dead spot in the cold store loses nothing. One line is short, so we flag it." |
| 6 | Dispatcher | **Live tracking** | "Dispatch sees *released with shortfall* straight away, and the trips at risk of missing a window sit at the top." |
| 7 | Driver | **Arrived** → **Start delivery & POD**. Read the 6-digit code from window D (signed in as the stop's branch manager, `store-` plus its `OUT…` id; **Deliveries** shows the *Delivery code*) and type it in. Sign, receiver name, **Complete delivery** | "The POD starts from what was actually loaded, not what was planned. The store reads out a code only when the goods are in front of them." |
| 8 | Driver | **More → No signal**, then deliver the next stop the same way | "Kadugannawa pass, no signal. The stop is saved on the phone and the code is checked when it syncs. See *Offline · 2 queued*." |
| 9 | Dispatcher | **Plan & allocate**: click one of VEH011's later stops → **Defer order** | "Meanwhile dispatch changes the run." |
| 10 | Driver | **No signal** off | "Back in coverage. The queued stop syncs with its original time, and the driver sees *Your run was changed by dispatch*." |
| 11 | Store | Switch to the outlet from step 7 → **Confirm receipt**, mark one item damaged | "The receipt closes the loop. Any issue goes back to dispatch as an exception." |
| 12 | Dispatcher | **Live tracking** / **Deliveries**, open the stop | "Code matched, signature, photos and the store's count, side by side." |

Close on HR (Waypoint People, :3001, `admin`) only if there's time.

## If something goes wrong on stage

- **A screen looks stale:** each tab updates itself from server events. Reload the tab; the session survives.
- **The driver shows the wrong vehicle or no run:** VEH011 must be assigned to Ruwan. Check **Network records → Vehicles**.
- **The venue Wi-Fi is bad:** that's the point of the driver app. Keep going; the outbox catches up. For the rest, run everything from `localhost`.
- **Out of order:** **Network records → Demo day → Reset** starts the day again and keeps staff and accounts.
