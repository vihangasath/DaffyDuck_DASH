import { expect, test } from "@playwright/test";
import { API, apiGet, apiLogin, newRole, resetDemoDay, signIn, warmUp } from "./helpers";

// The loader phone app's promise: a dead spot on the dock loses no ticks. Ticks are kept on the phone,
// survive a reload with no network, and reach the server on reconnect. Flagging and release wait for signal.

const VEHICLE = "VEH011";

async function op(name: string, args: unknown) {
  const res = await fetch(`${API}/api/ops/${name}`, { method: "POST", headers: { authorization: `Bearer ${await apiLogin("dispatcher")}`, "content-type": "application/json" }, body: JSON.stringify(args) });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
}

type Loads = { db: { loads: Record<string, { lines: Record<string, { loaded: number; planned: number }> }> } };
const serverLoaded = async (tripId: string) => {
  const s = await apiGet<Loads>(await apiLogin("dispatcher"), "/ops/snapshot");
  return Object.values(s.db.loads[tripId].lines).filter((l) => l.loaded >= l.planned).length;
};

test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);
test.beforeAll(async () => {
  await warmUp();
  await resetDemoDay();
  await op("closeOrdersAndPlan", { depot: "Peliyagoda" });
  await op("publishPlan", { depot: "Peliyagoda" });
});

test("loader phone app keeps ticking with no Wi-Fi", async ({ browser }) => {
  const { ctx, page: p } = await newRole(browser, { phone: true });
  await signIn(p, "loader", /\/loader$/);
  await expect(p.getByRole("navigation", { name: "Loader" })).toBeVisible();
  await p.getByRole("link", { name: new RegExp(`^${VEHICLE} trip 1,`) }).click();
  await expect(p.getByText("Load last stop first")).toBeVisible({ timeout: 60_000 });
  const tripId = p.url().split("/loader/")[1];
  const hasSw = await p.evaluate(async () => !!(await Promise.race([navigator.serviceWorker?.ready, new Promise((r) => setTimeout(() => r(null), 5000))])));
  // The app asks the service worker to keep this screen; give it a moment, as any real phone has.
  if (hasSw)
    await expect
      .poll(() => p.evaluate(async () => {
        // `nomodule` scripts are legacy-browser polyfills a modern phone never loads.
        const scripts = [...document.scripts].filter((x) => !x.noModule).map((x) => x.src).filter((u) => u.includes("/_next/static/"));
        const hits = await Promise.all([location.pathname, ...scripts].map((u) => caches.match(u)));
        return hits.every(Boolean);
      }), { timeout: 15_000 })
      .toBe(true);
  const pill = p.getByRole("link", { name: "Sync status" });
  const ticked = p.getByRole("button", { name: /^Unmark / });

  await test.step("cut the network and tick two lines", async () => {
    await ctx.route("**/api/**", (r) => r.abort("internetdisconnected"));
    await ctx.setOffline(true);
    await expect(pill).toContainText("Offline");
    for (let i = 1; i <= 2; i++) {
      await p.getByRole("button", { name: /^Mark .+ loaded$/ }).first().click();
      await expect(ticked).toHaveCount(i);
    }
    await expect(pill).toContainText("2 queued");
    await expect(p.getByText("Flagging and release need signal")).toBeVisible();
    await expect(p.getByRole("link", { name: /Flag shortfall/ })).toHaveAttribute("aria-disabled", "true");
    expect(await serverLoaded(tripId)).toBe(0);
  });

  await test.step("reload with no network: the ticks are still there", async () => {
    if (!hasSw) return test.info().annotations.push({ type: "skipped", description: "offline reload: no service worker in a dev build" });
    await p.reload();
    await expect(p.getByText("Load last stop first")).toBeVisible();
    await expect(ticked).toHaveCount(2);
    await expect(pill).toContainText(/2 queued/);
  });

  await test.step("signal back: the ticks reach the server", async () => {
    await ctx.unroute("**/api/**");
    await ctx.setOffline(false);
    await expect(pill).toContainText("Synced", { timeout: 45_000 });
    await expect.poll(() => serverLoaded(tripId), { timeout: 15_000 }).toBe(2);
    await expect(ticked).toHaveCount(2);
  });

  await ctx.close();
});
