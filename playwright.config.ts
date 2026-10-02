import { defineConfig, devices } from "@playwright/test";

// Judge-walkthrough smoke tests. They drive the running stack; they don't start it.
//   npm run dev                      → npm run e2e            (defaults: :3000 / :3001 / :4000)
//   scripts/fresh-clone-check.sh     → runs these against a fresh `docker compose up` clone
// Each run resets the demo day first (staff, accounts and master data are kept).
export default defineConfig({
  testDir: "e2e",
  // One shared database: the specs run one after another.
  workers: 1,
  fullyParallel: false,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/.report" }]],
  outputDir: "e2e/.results",
  use: {
    baseURL: process.env.WEB_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
    // PW_CHANNEL=chrome uses the installed Google Chrome instead of downloading Playwright's Chromium.
    channel: process.env.PW_CHANNEL,
  },
});
