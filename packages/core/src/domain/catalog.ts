import type { Brand, Order, OrderLine, Temp } from "./types";

export type { OrderLine };

export interface Sku {
  id: string;
  name: string;
  unit: string;
  brand: Brand;
  temp: Temp;
  weightKg: number;
  volumeM3: number;
  active?: boolean;
}

/** Small illustrative catalogue: orders in the datasets carry only totals, so lines are derived. */
export const CATALOG: Sku[] = [
  { id: "F-MILK", name: "Fresh milk 1 L", unit: "Crate of 12", brand: "Fresh", temp: "chilled", weightKg: 13, volumeM3: 0.03 },
  { id: "F-YOG", name: "Yoghurt 80 g", unit: "Crate of 48", brand: "Fresh", temp: "chilled", weightKg: 5, volumeM3: 0.025 },
  { id: "F-CURD", name: "Buffalo curd 1 kg", unit: "Case of 6", brand: "Fresh", temp: "chilled", weightKg: 7, volumeM3: 0.02 },
  { id: "F-CHKN", name: "Whole chicken", unit: "Chilled box 10 kg", brand: "Fresh", temp: "chilled", weightKg: 10.5, volumeM3: 0.03 },
  { id: "F-FISH", name: "Seer fish", unit: "Chilled box 5 kg", brand: "Fresh", temp: "chilled", weightKg: 5.5, volumeM3: 0.02 },
  { id: "F-VEG", name: "Upcountry vegetables", unit: "Crate", brand: "Fresh", temp: "ambient", weightKg: 9, volumeM3: 0.045 },
  { id: "F-RICE", name: "Samba rice 5 kg", unit: "Bag", brand: "Fresh", temp: "ambient", weightKg: 5, volumeM3: 0.008 },
  { id: "F-DRY", name: "Dry grocery", unit: "Case", brand: "Fresh", temp: "ambient", weightKg: 8, volumeM3: 0.04 },
  { id: "F-BREAD", name: "Bread", unit: "Tray", brand: "Fresh", temp: "ambient", weightKg: 4, volumeM3: 0.05 },
  { id: "S-HANG", name: "Hanging garments", unit: "Rail of 40", brand: "Style", temp: "ambient", weightKg: 18, volumeM3: 0.9 },
  { id: "S-CTN", name: "Folded apparel", unit: "Carton", brand: "Style", temp: "ambient", weightKg: 9, volumeM3: 0.12 },
  { id: "S-SHOE", name: "Footwear", unit: "Carton", brand: "Style", temp: "ambient", weightKg: 11, volumeM3: 0.1 },
  { id: "T-TV", name: "55\" television", unit: "Boxed unit", brand: "Tech", temp: "ambient", weightKg: 22, volumeM3: 0.25 },
  { id: "T-FRDG", name: "Refrigerator", unit: "Boxed unit", brand: "Tech", temp: "ambient", weightKg: 65, volumeM3: 0.7 },
  { id: "T-WASH", name: "Washing machine", unit: "Boxed unit", brand: "Tech", temp: "ambient", weightKg: 60, volumeM3: 0.45 },
  { id: "T-SMALL", name: "Small appliances", unit: "Carton", brand: "Tech", temp: "ambient", weightKg: 8, volumeM3: 0.06 },
];

/** An order's lines: the stored ones, or a deterministic split of its units into catalogue lines. */
export function linesFor(order: Order): OrderLine[] {
  if (order.lines?.length) return order.lines;
  return deriveLines(order);
}

/** Deterministic split of an order's units into catalogue lines (used once, when seeding). */
export function deriveLines(order: Order): OrderLine[] {
  const skus = CATALOG.filter((s) => s.brand === order.brand && s.temp === order.temp);
  if (!skus.length) return [{ skuId: "MISC", name: "Mixed goods", unit: "Unit", qty: order.units }];
  const seed = [...order.id].reduce((s, c) => s + c.charCodeAt(0), 0);
  const n = Math.min(skus.length, order.units >= 30 ? 3 : order.units >= 8 ? 2 : 1);
  const picked = Array.from({ length: n }, (_, i) => skus[(seed + i * 2) % skus.length]).filter((s, i, a) => a.indexOf(s) === i);
  const lines: OrderLine[] = [];
  let left = order.units;
  picked.forEach((s, i) => {
    const qty = i === picked.length - 1 ? left : Math.max(1, Math.round((order.units * (i === 0 ? 0.5 : 0.3))));
    left -= qty;
    lines.push({ skuId: s.id, name: s.name, unit: s.unit, qty });
  });
  return lines.filter((l) => l.qty > 0);
}
