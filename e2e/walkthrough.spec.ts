import { expect, test, type Page } from "@playwright/test";
import { storeTab, ADMIN, apiGet, apiLogin, detectSeed, newRole, enterCode, resetDemoDay, sign, signIn, type Seed, warmUp } from "./helpers";

// The README's judge walkthrough, end to end, in four tabs (one per role) plus HR.
// It is also the demo story: dispatcher publishes → loader flags a shortfall → driver completes a stop
// → dispatcher changes the run while the driver is in a dead zone → driver reconnects and sees the change.
// Nothing here depends on which seed is loaded, so it passes on the shared dataset and the synthetic fallback.

const VEHICLE = "VEH011";
type Snap = { db: { plans: Record<string, { status: string; trips: { id: string; vehicleId: string; tripNo: number; orderIds: string[] }[] } | null>; orders: { id: string; outletId: string }[] } };

async function veh011Trips() {
  const s = await apiGet<Snap>(await apiLogin("dispatcher"), "/ops/snapshot");
  const trips = s.db.plans.Peliyagoda?.trips.filter((t) => t.vehicleId === VEHICLE).sort((a, b) => a.tripNo - b.tripNo) ?? [];
  return { trips, outletOf: (id: string) => s.db.orders.find((o) => o.id === id)!.outletId };
}

/** The driver's "Next stop" card: Arrived → stop screen → Start delivery & POD → Complete delivery. */
async function deliverNextStop(driver: Page) {
  const next = driver.getByRole("region", { name: "Next stop" });
  await next.getByRole("button", { name: "Arrived" }).click();
  // Arrived opens the stop screen (unload list, access notes); the POD starts from there.
  await expect(driver).toHaveURL(/\/driver\/stop\/[^/]+$/, { timeout: 30_000 });
  await driver.getByRole("button", { name: "Start delivery & POD" }).click();
  await expect(driver).toHaveURL(/\/pod$/, { timeout: 30_000 });
  const orderId = decodeURIComponent(driver.url().split("/stop/")[1].split("/")[0]);
  await enterCode(driver, orderId);
  await sign(driver);
  await driver.getByPlaceholder("Name of the person signing").fill("S. Perera");
  await driver.getByRole("button", { name: "Complete delivery" }).click();
  await expect(driver).toHaveURL(/\/driver$/);
  return orderId;
}

test.describe.configure({ mode: "serial" });
// Eleven steps in five tabs; a dev server compiling pages on first visit needs ~3 min.
test.setTimeout(300_000);

let seed: Seed;
test.beforeAll(async () => {
  await warmUp();
  await resetDemoDay();
  seed = await detectSeed();
  if (process.env.EXPECT_SEED) expect(seed, "seed loaded by this stack").toBe(process.env.EXPECT_SEED);
  console.log(`  seed: ${seed}`);
});

test("judge walkthrough: four roles, one delivery day", async ({ browser }) => {
  const store = await newRole(browser);
  const dispatch = await newRole(browser);
  const loader = await newRole(browser, { phone: true });
  const driver = await newRole(browser, { phone: true });

  await test.step("1 · store places a chilled order", async () => {
    const p = store.page;
    await signIn(p, "store", /\/store$/);
    await p.goto("/store/order");
    await p.getByRole("tab", { name: "Chilled" }).click();
    await p.getByRole("button", { name: "Increase" }).first().click();
    await p.getByRole("button", { name: "Increase" }).first().click();
    await p.getByRole("button", { name: "Submit order" }).click();
    await expect(p.getByRole("heading", { name: /Order WP-\d+ confirmed/ })).toBeVisible();
  });

  await test.step("2 · dispatcher closes orders and auto-plans", async () => {
    const p = dispatch.page;
    await signIn(p, "dispatcher", /\/dispatcher$/);
    await expect(p.getByRole("heading", { name: "Today" })).toBeVisible();
    await p.getByRole("button", { name: "Close orders & auto-plan" }).click();
    await expect(p).toHaveURL(/\/dispatcher\/plan/);
    // Refrigerated capacity binds on both seeds.
    await expect(p.getByText("Limiting").first()).toBeVisible();
  });

  await test.step("3 · dispatcher publishes to loaders", async () => {
    const p = dispatch.page;
    await p.getByRole("button", { name: "Publish to loaders" }).click();
    await expect(p.getByRole("button", { name: "Re-publish" })).toBeVisible();
    const { trips } = await veh011Trips();
    expect(trips.length, `${VEHICLE} has a trip in the published plan`).toBeGreaterThan(0);
    // Two stops get delivered and a later one is deferred: 3 across the run (trip 1 has 8 on the shared seed, 2 on the synthetic one).
    expect(trips.flatMap((t) => t.orderIds).length, `${VEHICLE} needs 3+ stops for the demo`).toBeGreaterThanOrEqual(3);
  });

  await test.step(`4 · loader loads ${VEHICLE} and flags a shortfall`, async () => {
    const p = loader.page;
    await signIn(p, "loader", /\/loader$/);
    await p.getByRole("link", { name: new RegExp(`^${VEHICLE} trip 1,`) }).click();
    await expect(p.getByText("Load last stop first")).toBeVisible();
    const marks = p.getByRole("button", { name: /^Mark .+ loaded$/ });
    const n = await marks.count();
    expect(n).toBeGreaterThan(1);
    // Tick every line except the last one.
    const ticked = p.getByRole("button", { name: /^Unmark / });
    for (let i = 0; i < n - 1; i++) {
      await marks.first().click();
      await expect(ticked).toHaveCount(i + 1);
    }
    await expect(p.getByRole("button", { name: "1 line left" })).toBeVisible();
    await p.getByRole("link", { name: /Flag shortfall/ }).click();
    await expect(p.getByRole("heading", { name: "Flag an issue" })).toBeVisible({ timeout: 60_000 });
    await expect(p.getByRole("button", { name: "Send & release" })).toBeEnabled();
    await p.getByRole("button", { name: "Send & release" }).click();
    await expect(p).toHaveURL(/\/loader$/);
  });

  await test.step("5 · dispatcher sees the exception", async () => {
    const p = dispatch.page;
    await p.goto("/dispatcher/live");
    await expect(p.getByText(/released with shortfall/i).first()).toBeVisible();
  });

  let delivered = "";
  await test.step("6 · driver completes a stop", async () => {
    const p = driver.page;
    await signIn(p, "driver", /\/driver$/);
    await expect(p.getByRole("region", { name: "Next stop" })).toBeVisible();
    delivered = await deliverNextStop(p);
    await expect(p.getByRole("link", { name: "Sync status" })).toContainText("Synced", { timeout: 30_000 });
    await p.goto("/driver/outbox");
    await expect(p.getByText("Synced").first()).toBeVisible();
    const refused = await p.getByText("Not accepted").count();
    if (refused) console.log(await p.locator("body").innerText());
    expect(refused, "the server refused a driver record").toBe(0);
  });

  let queuedOrder = "";
  await test.step("7 · driver drives into a dead zone and keeps working", async () => {
    const p = driver.page;
    await p.goto("/driver/more");
    await p.getByRole("switch", { name: /No signal/ }).click();
    await p.goto("/driver");
    await expect(p.getByRole("link", { name: "Sync status" })).toContainText("Offline");
    queuedOrder = await deliverNextStop(p);
    await expect(p.getByRole("link", { name: "Sync status" })).toContainText("2 queued");
    await p.goto("/driver/outbox");
    await expect(p.getByText("Queued").first()).toBeVisible();
    // A reload with no signal still shows the whole run, from the phone.
    await p.goto("/driver");
    await p.reload();
    await expect(p.getByRole("region", { name: "Next stop" })).toBeVisible();
  });

  let removed = "";
  await test.step("8 · dispatcher re-plans: defers one of the driver's later stops", async () => {
    const { trips } = await veh011Trips();
    const later = trips.flatMap((t) => t.orderIds).filter((id) => id !== delivered && id !== queuedOrder);
    removed = later[later.length - 1];
    const p = dispatch.page;
    await p.goto("/dispatcher/plan");
    await p.getByLabel("Vehicle lanes").getByRole("button", { name: new RegExp(`^${removed} \\d`) }).click();
    await p.getByRole("button", { name: "Defer order" }).click();
    await expect(p.getByText(`${removed} deferred`).first()).toBeVisible();
  });

  await test.step("9 · driver reconnects: the queued stop syncs and the change shows up", async () => {
    const p = driver.page;
    await p.goto("/driver/more");
    await p.getByRole("switch", { name: /No signal/ }).click();
    await p.goto("/driver");
    await expect(p.getByRole("link", { name: "Sync status" })).toContainText("Synced", { timeout: 45_000 });
    await expect(p.getByText("Your run was changed by dispatch")).toBeVisible({ timeout: 45_000 });
    await expect(p.getByText(removed).first()).toBeVisible();
    // The record kept its on-phone time and reached the server.
    const s = await apiGet<{ db: { stops: Record<string, { deliveredAt?: string }> } }>(await apiLogin("dispatcher"), "/ops/snapshot");
    expect(s.db.stops[queuedOrder]?.deliveredAt).toBeTruthy();
  });

  await test.step("10 · store confirms receipt with an issue", async () => {
    const { outletOf } = await veh011Trips();
    const outlet = outletOf(delivered);
    // The manager of the branch the driver delivered to.
    const branch = await storeTab(browser, outlet);
    const p = branch.page;
    await p.goto(`/store/receipt/${delivered}`);
    await expect(p.getByRole("heading", { name: "Confirm receipt" })).toBeVisible();
    // One unit of the first item arrived damaged (its second stepper counts damage).
    await p.getByRole("button", { name: "Increase" }).nth(1).click();
    await expect(p.getByText("1 damaged").first()).toBeVisible();
    await p.getByRole("button", { name: /^Confirm receipt/ }).click();
    await expect(p).toHaveURL(/\/store$/);
    await branch.ctx.close();
  });

  await test.step("10b · dispatcher sees the code check and the itemised receipt", async () => {
    const p = dispatch.page;
    await p.goto("/dispatcher/live");
    await expect(p.getByText(/receipt: damaged/).first()).toBeVisible({ timeout: 30_000 });
    await expect(p.getByText(/Damaged: 1 ×/).first()).toBeVisible();
    await p.goto(`/dispatcher/deliveries?order=${encodeURIComponent(delivered)}`);
    await expect(p.getByRole("dialog")).toContainText("Store receipt");
    await expect(p.getByRole("dialog").getByText(/^Code \d{6} ✓$/)).toBeVisible();
  });

  await test.step("11 · HR signs in to Waypoint People", async () => {
    const hr = await browser.newContext();
    const p = await hr.newPage();
    await signIn(p, "admin", new RegExp(`^${ADMIN}/?$`), ADMIN);
    await expect(p.getByText(/Front desk/i).first()).toBeVisible();
    await hr.close();
  });

  for (const r of [store, dispatch, loader, driver]) await r.ctx.close();
});
