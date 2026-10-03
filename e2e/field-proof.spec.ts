import { devices, expect, test } from "@playwright/test";
import { chooseOutlet, WEB, apiGet, apiLogin, apiOp as op, enterCode, newRole, publishedDay, releaseVehicle, sign, signIn, warmUp } from "./helpers";

// Proof from the field, end to end: real photos from the dock and the doorstep, the store's delivery
// code, the phone's location and connectivity log, the live watch (dwell alert + late notice) and the
// store's countdown and itemised receipt, each as dispatch sees it.

const VEHICLE = "VEH011";
// A 1×1 PNG: enough for the camera input; the phone keeps it as is (already smaller than a re-encode).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const photo = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });

type Snap = {
  db: {
    plans: Record<string, { trips: { id: string; vehicleId: string; tripNo: number; orderIds: string[] }[] } | null>;
    loads: Record<string, { status: string; lines: Record<string, { planned: number }> }>;
    orders: { id: string; outletId: string; confirmCode?: string }[];
    stops: Record<string, { deliveredAt?: string; arrivedAt?: string; pod?: { photoIds?: string[]; codeOk?: boolean } }>;
    exceptions: { kind: string; ref: { orderId?: string }; resolved?: boolean }[];
    notices: { kind: string; orderId?: string; outletId: string; acknowledged?: string }[];
    driverSync: Record<string, { position?: { lat: number; lng: number }; check?: { missing: string[] } }>;
    connectivity: { vehicleId: string; state: string }[];
    photos: Record<string, { kind: string }>;
  };
};
const snap = async () => apiGet<Snap>(await apiLogin("dispatcher"), "/ops/snapshot");

test.describe.configure({ mode: "serial" });
test.setTimeout(360_000);

test.beforeAll(async () => {
  await warmUp();
  await publishedDay();
});

test("photos, delivery codes, location, live watch and receipts reach dispatch", async ({ browser }) => {
  const dispatch = await newRole(browser);
  const store = await newRole(browser);
  const loader = await newRole(browser, { phone: true });
  // The driver's phone has a location (as a browser would after the driver allows it).
  const driverCtx = await browser.newContext({ ...devices["Pixel 7"], baseURL: WEB, geolocation: { latitude: 6.9497, longitude: 79.9035, accuracy: 15 }, permissions: ["geolocation"] });
  const driver = await driverCtx.newPage();
  await signIn(dispatch.page, "dispatcher", /\/dispatcher$/);

  await test.step("1 · loader flags damage with a photo; dispatch sees the photo", async () => {
    const s = await snap();
    const trip = s.db.plans.Peliyagoda!.trips.find((t) => t.vehicleId !== VEHICLE && Object.keys(s.db.loads[t.id].lines).length > 0)!;
    const p = loader.page;
    await signIn(p, "loader", /\/loader$/);
    await p.goto(`/loader/${trip.id}/flag`);
    await expect(p.getByRole("heading", { name: "Flag an issue" })).toBeVisible({ timeout: 60_000 });
    await p.getByRole("tab", { name: "Damaged" }).click();
    await p.getByLabel("Add photo of the item").setInputFiles(photo("dent.png"));
    await expect(p.getByRole("img", { name: "Photo 1" })).toBeVisible();
    await p.getByRole("radio", { name: /Hold vehicle/ }).click();
    await p.getByRole("button", { name: "Send & hold vehicle" }).click();
    await expect(p).toHaveURL(new RegExp(`/loader/${trip.id}$`));

    const d = dispatch.page;
    await d.goto("/dispatcher/live");
    await expect(d.getByText(/held · shortfall/).first()).toBeVisible();
    await d.getByRole("button", { name: /^Open photo: Dock · / }).first().click();
    await expect(d.getByRole("dialog", { name: "Photo" }).getByRole("img")).toBeVisible();
    await d.keyboard.press("Escape");
  });

  // The driver's trips leave the dock (through the API: this spec is about what happens after).
  await releaseVehicle(VEHICLE);
  const s0 = await snap();
  const trips = s0.db.plans.Peliyagoda!.trips.filter((t) => t.vehicleId === VEHICLE).sort((a, b) => a.tripNo - b.tripNo);
  const stops = trips.flatMap((t) => t.orderIds);
  const outletOf = (id: string) => s0.db.orders.find((o) => o.id === id)!.outletId;
  let delivered = "";

  await test.step("2 · driver delivers with the store's code and a photo; the phone shares its location", async () => {
    const p = driver;
    await signIn(p, "driver", /\/driver$/);
    await p.getByRole("region", { name: "Next stop" }).getByRole("button", { name: "Arrived" }).click();
    await expect(p).toHaveURL(/\/driver\/stop\/[^/]+$/, { timeout: 30_000 });
    await p.getByRole("button", { name: "Start delivery & POD" }).click();
    await expect(p).toHaveURL(/\/pod$/, { timeout: 30_000 });
    delivered = decodeURIComponent(p.url().split("/stop/")[1].split("/")[0]);
    // A wrong code is caught at the stop while there is signal.
    await p.getByLabel("Delivery code").fill(s0.db.orders.find((o) => o.id === delivered)!.confirmCode === "000000" ? "111111" : "000000");
    await expect(p.getByText(/That code doesn’t match/)).toBeVisible();
    await expect(p.getByRole("button", { name: "Complete delivery" })).toBeDisabled();
    await enterCode(p, delivered);
    await p.getByLabel("Add delivery photo").setInputFiles(photo("doorstep.png"));
    await expect(p.getByRole("img", { name: "Delivery photo 1" })).toBeVisible();
    await sign(p);
    await p.getByPlaceholder("Name of the person signing").fill("S. Perera");
    await p.getByRole("button", { name: "Complete delivery" }).click();
    await expect(p).toHaveURL(/\/driver$/);
    await expect(p.getByRole("link", { name: "Sync status" })).toContainText("Synced", { timeout: 30_000 });
    await expect.poll(async () => {
      const s = await snap();
      const pod = s.db.stops[delivered]?.pod;
      return !!pod?.codeOk && pod.photoIds?.length === 1 && !!s.db.photos[pod.photoIds[0]] && !!s.db.driverSync[VEHICLE]?.position;
    }, { timeout: 45_000, message: "POD with code, uploaded photo and a phone position on the server" }).toBe(true);
  });

  await test.step("3 · dispatch sees the code, the photo and the vehicle on the map", async () => {
    const d = dispatch.page;
    await d.goto(`/dispatcher/deliveries?order=${encodeURIComponent(delivered)}`);
    const drawer = d.getByRole("dialog");
    await expect(drawer.getByText(/^Code \d{6} ✓$/)).toBeVisible();
    await drawer.getByRole("button", { name: /Open photo/ }).click();
    await expect(d.getByRole("dialog", { name: "Photo" }).getByRole("img")).toBeVisible();
    await d.keyboard.press("Escape");
    await d.goto("/dispatcher/live");
    await expect(d.getByRole("region", { name: /Map of 1 vehicle position/ })).toBeVisible();
    await expect(d.locator(".wp-fleet", { hasText: VEHICLE })).toBeVisible();
  });

  const pending = stops.filter((id) => id !== delivered);
  const here = pending[0];
  const later = pending.slice(1);

  await test.step("4 · store sees its delivery code and the arrival countdown", async () => {
    const p = store.page;
    await signIn(p, "store", /\/store$/);
    await chooseOutlet(p, outletOf(here));
    const code = s0.db.orders.find((o) => o.id === here)!.confirmCode!;
    await expect(p.getByLabel(`Delivery code ${code.split("").join(" ")}`)).toBeVisible();
    await expect(p.getByText(/Arriving in/).first()).toBeVisible();
  });

  await test.step("5 · a long stop: dispatch is alerted and a later store is told it will be late", async () => {
    // The driver has been at the next stop for four hours (recorded on the phone that long ago).
    const at = new Date(Date.now() - 240 * 60_000).toISOString();
    await op("driver", "syncDriverEvents", { vehicleId: VEHICLE, events: [{ id: `e2e-dwell-${Date.now()}`, vehicleId: VEHICLE, kind: "arrived", orderId: here, at: "06:00", recordedAt: at }] });
    // The API's live watch runs every 30 s.
    await expect.poll(async () => (await snap()).db.exceptions.some((e) => e.kind === "dwell" && e.ref.orderId === here && !e.resolved), { timeout: 70_000, message: "dwell alert" }).toBe(true);
    const d = dispatch.page;
    await d.goto("/dispatcher/live");
    await expect(d.getByText(/Still there · \d+ min so far/).first()).toBeVisible();

    // Four hours pushes the later stops past their windows (on every seed VEH011 has 3+ stops).
    const s = await snap();
    const told = s.db.notices.find((n) => n.kind === "late" && later.includes(n.orderId ?? ""));
    expect(told, "a later store was told it will be late").toBeTruthy();
    const p = store.page;
    await chooseOutlet(p, told!.outletId);
    await expect(p.getByText(/We’re sorry, we’ll be about \d+ min late\. Is that OK\?/).first()).toBeVisible();
    await p.getByRole("button", { name: "Reduce the order" }).first().click();
    await expect(p.getByText(/Dispatch will call you/)).toBeVisible();
    await d.goto("/dispatcher/live");
    await expect(d.getByText(/asked to reduce the order/).first()).toBeVisible();
  });

  await test.step("6 · the phone's dead zone shows up in dispatch's connectivity log", async () => {
    const p = driver;
    await p.goto("/driver/more");
    await expect(p.getByText(/accurate to about \d+ m/)).toBeVisible();
    await p.getByRole("switch", { name: /No signal/ }).click();
    await p.goto("/driver");
    await expect(p.getByRole("link", { name: "Sync status" })).toContainText("Offline");
    await p.goto("/driver/more");
    await p.getByRole("switch", { name: /No signal/ }).click();
    await p.goto("/driver");
    await expect(p.getByRole("link", { name: "Sync status" })).toContainText("Synced", { timeout: 45_000 });
    await expect.poll(async () => (await snap()).db.connectivity.filter((c) => c.vehicleId === VEHICLE).map((c) => c.state).sort().join(), { timeout: 45_000 }).toBe("offline,online");
    const d = dispatch.page;
    await d.goto("/dispatcher/live");
    await expect(d.getByRole("row").filter({ hasText: VEHICLE }).filter({ hasText: /1×, \d+ min/ })).toBeVisible();
    await expect(d.getByText(/All \d+ records in the database/).first()).toBeVisible();
  });

  await test.step("7 · store receipt with a damaged item and a photo reaches dispatch itemised", async () => {
    const p = store.page;
    await chooseOutlet(p, outletOf(delivered));
    await p.goto(`/store/receipt/${delivered}`);
    await expect(p.getByRole("heading", { name: "Confirm receipt" })).toBeVisible();
    // Driver's photo is on the receipt screen too.
    await expect(p.getByRole("button", { name: /Open photo/ }).first()).toBeVisible();
    await p.getByRole("button", { name: "Increase" }).nth(1).click(); // first item: one arrived damaged
    await p.getByLabel("Add receipt photo").setInputFiles(photo("crushed.png"));
    await p.getByRole("button", { name: /^Confirm receipt/ }).click();
    await expect(p).toHaveURL(/\/store$/);
    const d = dispatch.page;
    await d.goto("/dispatcher/live");
    await expect(d.getByText(/receipt: damaged/).first()).toBeVisible();
    await expect(d.getByText(/1 driver photo · 1 store photo/).first()).toBeVisible();
  });

  for (const r of [store, dispatch, loader]) await r.ctx.close();
  await driverCtx.close();
});
