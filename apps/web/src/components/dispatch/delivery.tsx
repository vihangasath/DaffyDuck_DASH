"use client";
// What dispatch sees about one delivery: the code check, the driver's POD and photos, and the store's
// receipt with what was missing or damaged and its photos. Used on Live tracking and Deliveries.
import Link from "next/link";
import { KeyRound, PenLine } from "lucide-react";
import { Pill, cx } from "@/components/ui";
import { PhotoStrip, photoRefs } from "@/components/photos";
import type { Db, Pod, Receipt } from "@/lib/api";

/** The delivery code as the server judged it, next to the store's own code. */
export function CodeCheck({ pod, expected }: { pod?: Pod; expected?: string }) {
  if (!pod) return <span className="text-xs text-muted">—</span>;
  if (pod.codeOk)
    return (
      <Pill tone="success" icon={KeyRound}>
        Code {pod.code} ✓
      </Pill>
    );
  if (pod.code)
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <Pill tone="danger" icon={KeyRound}>Entered {pod.code} ✗</Pill>
        {expected && <span className="text-[11px] text-ink-2">store’s code {expected}</span>}
      </span>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Pill tone="warning" icon={KeyRound}>No code</Pill>
      {pod.noCode && <span className="text-[11px] text-ink-2">“{pod.noCode}”</span>}
    </span>
  );
}

/** Missing and damaged quantities per line. Only lines with a difference unless `all`. */
export function ReceiptLines({ r, all }: { r: Receipt; all?: boolean }) {
  const rows = r.lines.filter((l) => all || l.receivedQty < l.driverQty || l.damagedQty);
  if (!rows.length) return null;
  return (
    <table className="w-full text-xs">
      <thead className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted">
        <tr><th className="py-1 pr-2">Item</th><th className="px-1 py-1 text-right">Driver</th><th className="px-1 py-1 text-right">Arrived</th><th className="px-1 py-1 text-right">Missing</th><th className="py-1 pl-1 text-right">Damaged</th></tr>
      </thead>
      <tbody>
        {rows.map((l) => {
          const missing = l.driverQty - l.receivedQty;
          return (
            <tr key={l.skuId} className="border-t border-line">
              <td className="py-1 pr-2 font-medium">{l.name}</td>
              <td className="px-1 py-1 text-right tabular-nums text-ink-2">{l.driverQty}</td>
              <td className="px-1 py-1 text-right tabular-nums">{l.receivedQty}</td>
              <td className={cx("px-1 py-1 text-right tabular-nums", missing > 0 && "font-bold text-danger")}>{missing > 0 ? missing : "–"}</td>
              <td className={cx("py-1 pl-1 text-right tabular-nums", l.damagedQty && "font-bold text-warning")}>{l.damagedQty || "–"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Driver and store photos for an order, as one row of thumbnails. */
export function orderPhotos(db: Db, orderId: string) {
  return [...photoRefs(db.stops[orderId]?.pod?.photoIds, db.photos, "Driver at the stop"), ...photoRefs(db.receipts[orderId]?.photoIds, db.photos, "Store at receipt")];
}

/** The evidence block inside a Live tracking exception card. */
export function EvidenceBlock({ db, orderId }: { db: Db; orderId: string }) {
  const stop = db.stops[orderId];
  const receipt = db.receipts[orderId];
  const order = db.orders.find((o) => o.id === orderId);
  const photos = orderPhotos(db, orderId);
  if (!stop?.pod && !receipt) return null;
  return (
    <div className="grid gap-2 rounded-lg bg-canvas p-2.5">
      {stop?.pod && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-2">
          <CodeCheck pod={stop.pod} expected={order?.confirmCode} />
          <span className="flex items-center gap-1"><PenLine className="size-3" /> {stop.pod.receivedBy} · {stop.deliveredAt}</span>
        </div>
      )}
      {receipt && <ReceiptLines r={receipt} />}
      {photos.length > 0 && <PhotoStrip photos={photos} />}
      <Link href={`/dispatcher/deliveries?order=${encodeURIComponent(orderId)}`} className="w-fit text-xs font-semibold text-primary hover:underline">Open delivery</Link>
    </div>
  );
}
