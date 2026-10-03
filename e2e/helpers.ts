import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { devices } from "@playwright/test";

export const WEB = process.env.WEB_URL ?? "http://localhost:3000";
export const ADMIN = process.env.ADMIN_URL ?? "http://localhost:3001";
export const API = process.env.API_URL ?? "http://localhost:4000";
export const PASSWORD = process.env.DEMO_PASSWORD ?? "waypoint";

/** Signs in through the API (no browser), for setup and for reading state the screens don't print. */
export async function apiLogin(username: string, app: "web" | "admin" = "web"): Promise<string> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD, app }),
  });
  const json = (await res.json()) as { token?: string; error?: string };
  if (!json.token) throw new Error(`Login as ${username} failed: ${json.error ?? res.status}`);
  return json.token;
}

export async function apiGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}/api${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  return (await res.json()) as T;
}

/** Network records → Demo day → Reset: back to the start of the demo day. */
export async function resetDemoDay() {
  const token = await apiLogin("dispatcher");
  const res = await fetch(`${API}/api/network/reset`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}" });
  if (!res.ok) throw new Error(`Demo reset failed: ${res.status} ${await res.text()}`);
}

export type Seed = "shared" | "synthetic";

/** The shared (private) dataset uses S1- order ids for Peliyagoda; the public synthetic fallback uses DEMO-. */
export async function detectSeed(): Promise<Seed> {
  const token = await apiLogin("dispatcher");
  const s = await apiGet<{ db: { orders: { id: string; depot: string }[] } }>(token, "/ops/snapshot");
  const ids = s.db.orders.filter((o) => o.depot === "Peliyagoda").map((o) => o.id);
  if (ids.some((id) => id.startsWith("S1-"))) return "shared";
  if (ids.some((id) => id.startsWith("DEMO-"))) return "synthetic";
  throw new Error(`Unrecognised seed: ${ids.slice(0, 3).join(", ")}`);
}

/** A fresh tab with its own session, like a judge opening a new tab per role. */
export async function newRole(browser: Browser, opts: { phone?: boolean } = {}): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext(opts.phone ? { ...devices["Pixel 7"], baseURL: WEB } : { baseURL: WEB });
  const page = await ctx.newPage();
  return { ctx, page };
}

/** Signs in on the sign-in screen and waits for the role's landing page. */
export async function signIn(page: Page, username: string, landing: RegExp, base = WEB) {
  const hr = base === ADMIN;
  await page.goto(base + (hr ? "/login" : "/"));
  // Typing before React has hydrated the form gets wiped when it does.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  // Waypoint People keeps its filing-cabinet wording.
  await page.getByRole("button", { name: hr ? /Open the cabinet/ : /sign in/i }).click();
  // Generous: a dev server compiles each route on its first visit.
  await expect(page).toHaveURL(landing, { timeout: 60_000 });
}

/** Draws a signature stroke on the POD canvas. */
export async function sign(page: Page) {
  const pad = page.locator("canvas").first();
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.6);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width * (0.2 + i * 0.06), box.y + box.height * (0.6 - Math.sin(i / 2) * 0.3));
  await page.mouse.up();
}

/**
 * A dev server compiles each route on its first visit, which can take longer than a step's timeout.
 * Request every screen once up front (instant against a production build).
 */
export async function warmUp() {
  const routes = [
    "/", "/store", "/store/order", "/store/receipt/x", "/dispatcher", "/dispatcher/plan", "/dispatcher/live",
    "/loader", "/loader/x", "/loader/x/flag", "/loader/flags", "/loader/more",
    "/driver", "/driver/more", "/driver/outbox", "/driver/stop/x", "/driver/stop/x/pod",
  ];
  for (const r of routes) await fetch(WEB + r).catch(() => undefined);
  for (const r of ["/login", "/"]) await fetch(ADMIN + r).catch(() => undefined);
}
