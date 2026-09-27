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

/** What happens if this order is deferred again — shown next to every deferral. */
export function consequence(order: Order): string {
  const bits: string[] = [];
  if (order.deferredYesterday) bits.push("second consecutive skip for this outlet");
  if (order.temp === "chilled") bits.push("chilled stock at risk before opening");
  if (order.daysSinceLastServed >= 3) bits.push(`${order.daysSinceLastServed} days without a delivery`);
  if (!bits.length) bits.push("moves to the next run; store is notified automatically");
  return bits.join(" · ");
}
