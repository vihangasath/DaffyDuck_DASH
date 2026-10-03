import { expect, test } from "@playwright/test";
import { API, apiLogin, newRole, resetDemoDay, signIn, warmUp } from "./helpers";

// The dispatcher's planning promises: every deferral explains its score, and the live board puts
// late-risk trips first. Seed-agnostic: no counts are hard-coded.

async function op(name: string, args: unknown) {
  const res = await fetch(`${API}/api/ops/${name}`, { method: "POST", headers: { authorization: `Bearer ${await apiLogin("dispatcher")}`, "content-type": "application/json" }, body: JSON.stringify(args) });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
}

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);
test.beforeAll(async () => {
  await warmUp();
  await resetDemoDay();
  await op("closeOrdersAndPlan", { depot: "Peliyagoda" });
});

test("explainable deferrals and exceptions first", async ({ browser }) => {
  const { ctx, page: p } = await newRole(browser);
  await signIn(p, "dispatcher", /\/dispatcher$/);

  await test.step("every deferred order shows its priority breakdown", async () => {
    await p.goto("/dispatcher/plan");
    const tab = p.getByRole("tab", { name: /^Deferred \d+/ });
    const n = Number((await tab.innerText()).match(/\d+/)![0]);
    expect(n, "the demo day defers something on both seeds").toBeGreaterThan(0);
    const breakdowns = p.getByRole("list", { name: /^Priority \d+:/ });
    await expect(breakdowns).toHaveCount(n);
    for (const label of await breakdowns.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")!))) {
      expect(label).toMatch(/Days since served \(\d+\) \+\d+/);
      expect(label).toMatch(/(Chilled \/ perishable|Dry goods \(not perishable\)) \+\d+/);
      expect(label).toMatch(/(window|Window)[^,]* \+\d+/);
      const [, total] = label.match(/^Priority (\d+):/)!;
      const sum = [...label.matchAll(/\+(\d+)/g)].reduce((s, m) => s + Number(m[1]), 0);
      expect(sum, label).toBe(Number(total));
    }
  });

  await test.step("live board: late-risk trips first, worst first", async () => {
    await op("publishPlan", { depot: "Peliyagoda" });
    await p.goto("/dispatcher/live");
    const rows = p.locator("tbody tr");
    await expect(rows.first()).toBeVisible();
    const risks = (await rows.allInnerTexts()).map((t) => Number(t.match(/late risk (\d+)%/)?.[1] ?? 0));
    const flagged = risks.findLastIndex((r) => r > 20);
    // Every row with late risk sits above every row without, in falling order.
    expect(risks.slice(0, flagged + 1).every((r) => r > 20)).toBe(true);
    expect(risks.slice(0, flagged + 1)).toEqual([...risks.slice(0, flagged + 1)].sort((a, b) => b - a));
  });

  await ctx.close();
});
