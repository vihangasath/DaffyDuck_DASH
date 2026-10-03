import type { Network, Order } from "../domain/types";
import { toMin } from "../domain/time";

export interface ScorePart {
  label: string;
  points: number;
}
export interface Score {
  total: number;
  parts: ScorePart[];
}

/**
 * Explainable priority score. Higher = serve first, defer last.
 * Every component is shown to the dispatcher, so keep the rules simple.
 */
export function priority(order: Order, net: Network, festivalRamp: number): Score {
  const outlet = net.outlets.get(order.outletId)!;
  const parts: ScorePart[] = [];
  if (order.deferredYesterday) parts.push({ label: "Deferred yesterday", points: 30 });
  if (order.temp === "chilled") parts.push({ label: "Chilled / perishable", points: 20 });
  const overdue = Math.min(Math.max(order.daysSinceLastServed - 1, 0), 4);
  if (overdue > 0) parts.push({ label: `Days since served (${order.daysSinceLastServed})`, points: overdue * 4 });
  const base = order.brand === "Fresh" ? 10 : order.brand === "Tech" ? 5 : 0;
  if (base) parts.push({ label: order.brand === "Fresh" ? "Fresh daily replenishment" : "Tech high-value order", points: base });
  if (order.brand === "Fresh" && festivalRamp > 0)
    parts.push({ label: `Festival ramp (${festivalRamp.toFixed(1)})`, points: Math.round(festivalRamp * 20) });
  const width = outlet.mallWindow ? 120 : toMin(outlet.windowClose) - toMin(outlet.windowOpen);
  const tight = Math.max(0, Math.min(10, Math.round((300 - width) / 15)));
  if (tight) parts.push({ label: outlet.mallWindow ? "Fixed mall window" : "Tight delivery window", points: tight });
  return { total: parts.reduce((s, p) => s + p.points, 0), parts };
}

export interface ExplainedPart extends ScorePart {
  /** Short form for compact chips, e.g. "Chilled". */
  short: string;
  /** One of the three factors every order is judged on; shown even at +0. */
  core: boolean;
}

/**
 * The score as the dispatcher sees it: days since served, perishability and window tightness always
 * come first (at +0 when they don't apply), then whatever else added points. Same total as `priority`.
 */
export function explain(order: Order, net: Network, festivalRamp: number): { total: number; parts: ExplainedPart[] } {
  const s = priority(order, net, festivalRamp);
  const outlet = net.outlets.get(order.outletId)!;
  const take = (test: (label: string) => boolean) => {
    const i = s.parts.findIndex((p) => test(p.label));
    return i < 0 ? undefined : s.parts.splice(i, 1)[0];
  };
  const days = take((l) => l.startsWith("Days since served"));
  const chilled = take((l) => l === "Chilled / perishable");
  const window = take((l) => l === "Tight delivery window" || l === "Fixed mall window");
  const d = order.daysSinceLastServed;
  const core: ExplainedPart[] = [
    { label: `Days since served (${d})`, short: `${d}d since served`, points: days?.points ?? 0, core: true },
    { label: chilled ? "Chilled / perishable" : "Dry goods (not perishable)", short: chilled ? "Chilled" : "Dry", points: chilled?.points ?? 0, core: true },
    {
      label: window?.label ?? `Window ${outlet.windowOpen}–${outlet.windowClose} (wide)`,
      short: outlet.mallWindow ? "Mall window" : window ? "Tight window" : "Wide window",
      points: window?.points ?? 0,
      core: true,
    },
  ];
  const SHORT: Record<string, string> = { "Deferred yesterday": "Skipped yesterday", "Fresh daily replenishment": "Fresh daily", "Tech high-value order": "Tech value" };
  const rest = s.parts.map((p) => ({ ...p, short: SHORT[p.label] ?? (p.label.startsWith("Festival ramp") ? "Festival" : p.label), core: false }));
  return { total: s.total, parts: [...rest.filter((p) => p.label === "Deferred yesterday"), ...core, ...rest.filter((p) => p.label !== "Deferred yesterday")] };
}

/** What happens if this order is deferred again — shown next to every deferral. */
export function consequence(order: Order): string {
  const bits: string[] = [];
  if (order.deferredYesterday) bits.push("second consecutive skip for this outlet");
  if (order.temp === "chilled") bits.push("chilled stock at risk before opening");
  if (order.daysSinceLastServed >= 3) bits.push(`${order.daysSinceLastServed} days without a delivery`);
  if (!bits.length) bits.push("moves to the next run; store is notified automatically");
  return bits.join(" · ");
}
