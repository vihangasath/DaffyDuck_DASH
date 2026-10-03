import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { API, apiGet, apiLogin, newRole, resetDemoDay, sign, signIn, warmUp } from "./helpers";

// Offline-first is a core claim, so this checks it the way a live demo will stress it:
// a driver phone on a throttled mobile connection, a connection that stalls mid-request, and a real
// network cut (not the in-app "No signal" switch). The outbox and the sync pill must hold up in all three.

const VEHICLE = "VEH011";

async function op(token: string, name: string, args: unknown) {
  const res = await fetch(`${API}/api/ops/${name}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(args) });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Dispatcher publishes and the loader releases every VEH011 trip, through the API: this spec is about the driver. */
async function vehicleReleased() {
  await resetDemoDay();
  const d = await apiLogin("dispatcher");
  await op(d, "closeOrdersAndPlan", { depot: "Peliyagoda" });
  await op(d, "publishPlan", { depot: "Peliyagoda" });
  const s = await apiGet<{ db: { plans: Record<string, { trips: { id: string; vehicleId: string }[] }>; loads: Record<string, { lines: Record<string, { planned: number }> }> } }>(d, "/ops/snapshot");
  const l = await apiLogin("loader");
  for (const t of s.db.plans.Peliyagoda.trips.filter((t) => t.vehicleId === VEHICLE)) {
    for (const [key, line] of Object.entries(s.db.loads[t.id].lines)) await op(l, "setLoadLine", { tripId: t.id, key, loaded: line.planned });
    await op(l, "releaseTrip", { tripId: t.id });
  }
}

/** Chrome DevTools throttling, close to DevTools' "Slow 3G" preset: 400 ms RTT, ~50 KB/s each way. */
async function throttle(ctx: BrowserContext, page: Page, on: boolean) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", on ? { offline: false, latency: 400, downloadThroughput: 50_000, uploadThroughput: 50_000 } : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
}

async function deliverNextStop(p: Page) {
  const next = p.getByRole("region", { name: "Next stop" });
  await next.getByRole("button", { name: "Arrived" }).click();
  // Arrived opens the stop screen (unload list, access notes); the POD starts from there.
  await expect(p).toHaveURL(/\/driver\/stop\/[^/]+$/, { timeout: 30_000 });
  await p.getByRole("button", { name: "Start delivery & POD" }).click();
  await expect(p).toHaveURL(/\/pod$/, { timeout: 30_000 });
  const orderId = decodeURIComponent(p.url().split("/stop/")[1].split("/")[0]);
  await sign(p);
  await p.getByPlaceholder("Name of the person signing").fill("K. Silva");
  await p.getByRole("button", { name: "Complete delivery" }).click();
  await expect(p).toHaveURL(/\/driver$/, { timeout: 30_000 });
  return orderId;
}

const pill = (p: Page) => p.getByRole("link", { name: "Sync status" });
const deliveredOnServer = async (orderId: string) => {
  const s = await apiGet<{ db: { stops: Record<string, { deliveredAt?: string }> } }>(await apiLogin("dispatcher"), "/ops/snapshot");
  return !!s.db.stops[orderId]?.deliveredAt;
};

test.describe.configure({ mode: "serial" });
test.setTimeout(360_000);
test.beforeAll(async () => {
  await warmUp();
  await vehicleReleased();
});

test("driver app on a slow, stalling, then dropped connection", async ({ browser }) => {
  const { ctx, page: p } = await newRole(browser, { phone: true });
  await signIn(p, "driver", /\/driver$/);
  // Visit the driver screens once so a dev server has compiled them before the network gets bad.
  for (const path of ["/driver/outbox", "/driver/more", "/driver"]) await p.goto(path);
  await expect(p.getByRole("region", { name: "Next stop" })).toBeVisible();
  // Let the service worker install while the network is still good (production builds only).
  const hasSw = await p.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return false;
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 5000))]);
    return !!reg;
  });

  await test.step("slow 3G: the run loads and a delivery syncs", async () => {
    // A cold first visit, like a judge opening the driver app on a phone: nothing cached, no service worker.
    // Production builds only: unminified dev bundles take over a minute on 3G and say nothing about the demo.
    if (hasSw) {
      const cold = await newRole(browser, { phone: true });
      await throttle(cold.ctx, cold.page, true);
      const t0 = Date.now();
      await signIn(cold.page, "driver", /\/driver$/);
      await expect(cold.page.getByRole("region", { name: "Next stop" })).toBeVisible({ timeout: 90_000 });
      const secs = (Date.now() - t0) / 1000;
      console.log(`  cold sign-in to driver run on slow 3G: ${secs.toFixed(1)} s`);
      await cold.ctx.close();
    } else {
      test.info().annotations.push({ type: "skipped", description: "cold slow-3G load: dev build (run against the Docker stack)" });
    }
    // Then a delivery from the warmed-up phone on the same throttled link.
    await throttle(ctx, p, true);
    const id = await deliverNextStop(p);
    await expect(pill(p)).toContainText("Synced", { timeout: 45_000 });
    expect(await deliveredOnServer(id)).toBe(true);
    await throttle(ctx, p, false);
  });

  await test.step("stalled connection: the request times out, the record stays queued, a retry lands it", async () => {
    // The sync request reaches nothing and never answers, like one bar of signal on a hill road.
    await p.route("**/api/ops/syncDriverEvents", () => undefined);
    const id = await deliverNextStop(p);
    await expect(pill(p)).toContainText(/queued|Syncing/);
    await p.goto("/driver/outbox");
    await expect(p.getByText("Queued").first()).toBeVisible();
    // Signal comes back: the stuck request must not block the next attempt (20 s timeout + 20 s heartbeat).
    await p.unroute("**/api/ops/syncDriverEvents");
    await expect(p.getByText("Synced").first()).toBeVisible({ timeout: 70_000 });
    await expect.poll(() => deliveredOnServer(id), { timeout: 15_000 }).toBe(true);
  });

  await test.step("real network cut: work continues, reload survives, sync on reconnect", async () => {
    await p.goto("/driver");
    await expect(p.getByRole("region", { name: "Next stop" })).toBeVisible();
    // setOffline alone leaks through the service worker after a reload, so also refuse every request.
    await ctx.route("**/api/**", (r) => r.abort("internetdisconnected"));
    await ctx.setOffline(true);
    await expect(pill(p)).toContainText("Offline");
    const id = await deliverNextStop(p);
    await expect(pill(p)).toContainText("2 queued");
    if (hasSw) {
      await p.reload();
      await expect(p.getByRole("region", { name: "Next stop" })).toBeVisible();
      await expect(pill(p)).toContainText(/2 queued|Syncing 2/);
    } else {
      test.info().annotations.push({ type: "skipped", description: "offline reload: no service worker in a dev build (run against the Docker stack)" });
    }
    expect(await deliveredOnServer(id)).toBe(false);
    await ctx.unroute("**/api/**");
    await ctx.setOffline(false);
    await expect(pill(p)).toContainText("Synced", { timeout: 45_000 });
    await expect.poll(() => deliveredOnServer(id), { timeout: 15_000 }).toBe(true);
  });

  await ctx.close();
});
