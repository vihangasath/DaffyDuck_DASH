"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, KeyRound, PackageCheck, PenLine } from "lucide-react";
import { PageHeader, useDepot } from "@/components/dispatcher-shell";
import { Card, Empty, Pill, Seg, Spinner, cx } from "@/components/ui";
import { Drawer } from "@waypoint/ui/kit";
import { CodeCheck, ReceiptLines, orderPhotos } from "@/components/dispatch/delivery";
import { PhotoLink, PhotoStrip, photoRefs } from "@/components/photos";
import { useDb } from "@/lib/hooks";
import type { Db } from "@/lib/api";
import { outletName } from "@waypoint/core/reference";
import { fmtClock } from "@waypoint/core/domain/time";

export default function DeliveriesPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Deliveries />
    </Suspense>
  );
}

type Filter = "all" | "attention" | "receipt";

interface Row {
  orderId: string;
  outletId: string;
  vehicleId: string;
  when: string;
  attention: string[];
  awaitingReceipt: boolean;
}

/** Why a delivery needs a second look, in the order dispatch should read them. */
function attentionOf(db: Db, orderId: string): string[] {
  const s = db.stops[orderId];
  const r = db.receipts[orderId];
  const out: string[] = [];
  if (s?.problem) out.push("Not delivered");
  if (s?.pod && !s.pod.codeOk) out.push(s.pod.code ? "Wrong code" : "No code");
  if (s?.pod?.lines.some((l) => l.delivered < l.planned)) out.push("Delivered short");
  if (r?.lines.some((l) => l.receivedQty < l.driverQty)) out.push("Store: missing");
  if (r?.lines.some((l) => l.damagedQty)) out.push("Store: damaged");
  if (r && r.issues.some((i) => i.type !== "Count differs from driver")) out.push("Store: issue");
  return out;
}

function Deliveries() {
  const { depot } = useDepot();
  const { data: db } = useDb();
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const [filter, setFilter] = useState<Filter>("all");
  const open = params.get("order");

  const rows = useMemo<Row[]>(() => {
    if (!db) return [];
    const depotOf = new Map(db.orders.map((o) => [o.id, o]));
    return Object.values(db.stops)
      .filter((s) => depotOf.get(s.orderId)?.depot === depot && (s.arrivedAt || s.deliveredAt || s.problem))
      .map((s) => ({
        orderId: s.orderId,
        outletId: depotOf.get(s.orderId)!.outletId,
        vehicleId: s.vehicleId,
        when: s.deliveredAt ?? s.arrivedAt ?? "",
        attention: attentionOf(db, s.orderId),
        awaitingReceipt: !!s.deliveredAt && !db.receipts[s.orderId],
      }))
      .sort((a, b) => b.when.localeCompare(a.when));
  }, [db, depot]);

  if (!db) return <Spinner />;
  const shown = rows.filter((r) => filter === "all" || (filter === "attention" ? r.attention.length > 0 : r.awaitingReceipt));
  const delivered = rows.filter((r) => db.stops[r.orderId].pod);
  const withCode = delivered.filter((r) => db.stops[r.orderId].pod!.codeOk).length;
  const setOpen = (id: string | null) => router.replace(id ? `${path}?order=${encodeURIComponent(id)}` : path, { scroll: false });

  return (
    <>
      <PageHeader
        title="Deliveries"
        sub={`${depot} · proof of delivery, delivery codes, photos and store receipts`}
        chips={
          <>
            <Pill tone={withCode === delivered.length ? "success" : "warning"} icon={KeyRound} lg>{withCode}/{delivered.length} with the store’s code</Pill>
            <Pill tone={rows.some((r) => r.attention.length) ? "danger" : "success"} lg>{rows.filter((r) => r.attention.length).length} need a look</Pill>
          </>
        }
      />
      <div className="grid gap-4 p-5 lg:p-7">
        <Seg
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All · ${rows.length}` },
            { value: "attention", label: `Needs a look · ${rows.filter((r) => r.attention.length).length}` },
            { value: "receipt", label: `Awaiting receipt · ${rows.filter((r) => r.awaitingReceipt).length}` },
          ]}
        />
        {!shown.length ? (
          <Card>
            <Empty icon={PackageCheck} title={rows.length ? "Nothing in this view" : "No stops reached yet"}>
              {rows.length ? "Every delivery here is in order." : "Deliveries appear here as drivers sync arrivals and proofs of delivery."}
            </Empty>
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                <tr><th className="px-4 py-2">Stop</th><th className="px-2 py-2">Vehicle</th><th className="px-2 py-2">Delivered</th><th className="px-2 py-2">Code</th><th className="px-2 py-2">Photos</th><th className="px-4 py-2">Store receipt</th></tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const s = db.stops[r.orderId];
                  const rc = db.receipts[r.orderId];
                  const order = db.orders.find((o) => o.id === r.orderId);
                  return (
                    <tr key={r.orderId} onClick={() => setOpen(r.orderId)} className={cx("cursor-pointer border-t border-line align-top transition-colors hover:bg-canvas", r.attention.length > 0 && "bg-warning-soft/30")}>
                      <td className="px-4 py-2.5">
                        <button className="text-left font-semibold hover:underline" onClick={(e) => { e.stopPropagation(); setOpen(r.orderId); }}>{outletName(r.outletId)}</button>
                        <div className="text-xs text-ink-2">{r.orderId} · {r.outletId}</div>
                        {r.attention.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{r.attention.map((a) => <Pill key={a} tone={a === "Not delivered" || a === "Wrong code" || a === "Store: missing" ? "danger" : "warning"}>{a}</Pill>)}</div>}
                      </td>
                      <td className="px-2 py-2.5 font-medium">{r.vehicleId}</td>
                      <td className="px-2 py-2.5 text-ink-2">
                        {s.deliveredAt ? <><b className="text-ink">{s.deliveredAt}</b><div className="text-xs">signed {s.pod?.receivedBy}</div></> : s.problem ? <span className="font-semibold text-danger">Not delivered · {s.problem.reason}</span> : <>At the stop since {s.arrivedAt}</>}
                      </td>
                      <td className="px-2 py-2.5"><CodeCheck pod={s.pod} expected={order?.confirmCode} /></td>
                      <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>{orderPhotos(db, r.orderId).length ? <PhotoLink photos={orderPhotos(db, r.orderId)} /> : <span className="text-xs text-muted">none</span>}</td>
                      <td className="px-4 py-2.5">
                        {rc ? (
                          rc.lines.some((l) => l.receivedQty < l.driverQty || l.damagedQty) || rc.issues.length ? (
                            <Pill tone="warning">{receiptSummary(rc)}</Pill>
                          ) : (
                            <Pill tone="success" icon={CheckCircle2}>Confirmed · all in order</Pill>
                          )
                        ) : s.deliveredAt ? <span className="text-xs text-ink-2">Awaiting the store</span> : <span className="text-xs text-muted">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
      {open && db.stops[open] && <DeliveryDrawer db={db} orderId={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function receiptSummary(r: NonNullable<Db["receipts"][string]>) {
  const missing = r.lines.reduce((n, l) => n + Math.max(0, l.driverQty - l.receivedQty), 0);
  const damaged = r.lines.reduce((n, l) => n + (l.damagedQty ?? 0), 0);
  const other = r.issues.filter((i) => i.type !== "Count differs from driver").length;
  return [missing && `${missing} missing`, damaged && `${damaged} damaged`, other && `${other} issue${other > 1 ? "s" : ""}`].filter(Boolean).join(" · ") || "Issue";
}

function DeliveryDrawer({ db, orderId, onClose }: { db: Db; orderId: string; onClose: () => void }) {
  const s = db.stops[orderId];
  const r = db.receipts[orderId];
  const order = db.orders.find((o) => o.id === orderId);
  const pod = s.pod;
  return (
    <Drawer open title={order ? outletName(order.outletId) : orderId} sub={`${orderId} · ${s.vehicleId}${s.deliveredAt ? ` · delivered ${s.deliveredAt}` : ""}`} onClose={onClose}>
      <div className="grid gap-5">
        {s.problem && (
          <section className="rounded-xl border border-danger/30 bg-danger-soft p-3.5 text-sm">
            <b className="text-danger">Not delivered:</b> {s.problem.reason}
            {s.problem.tempC != null && ` · probe ${s.problem.tempC} °C`}
            {s.problem.note && ` · ${s.problem.note}`}
          </section>
        )}
        {pod && (
          <section className="grid gap-2.5">
            <h3 className="flex items-center gap-2 font-bold"><PenLine className="size-4" /> Driver’s proof of delivery</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-ink-2">Received by</dt><dd className="font-semibold">{pod.receivedBy}{pod.signed ? " · signed" : " · not signed"}</dd>
              <dt className="text-ink-2">Arrived / left</dt><dd>{s.arrivedAt ?? "—"} / {s.deliveredAt}</dd>
              <dt className="text-ink-2">Delivery code</dt><dd><CodeCheck pod={pod} expected={order?.confirmCode} /></dd>
              {order?.confirmCode && <><dt className="text-ink-2">Store’s code</dt><dd className="font-mono font-semibold tracking-widest">{order.confirmCode}</dd></>}
              {pod.note && <><dt className="text-ink-2">Note</dt><dd>{pod.note}</dd></>}
            </dl>
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted"><tr><th className="py-1">Item</th><th className="py-1 text-right">Ordered</th><th className="py-1 text-right">Delivered</th></tr></thead>
              <tbody>
                {pod.lines.map((l) => (
                  <tr key={l.skuId} className="border-t border-line">
                    <td className="py-1.5">{l.name}</td>
                    <td className="py-1.5 text-right tabular-nums text-ink-2">{l.planned}</td>
                    <td className={cx("py-1.5 text-right tabular-nums", l.delivered < l.planned && "font-bold text-warning")}>{l.delivered}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pod.photoIds?.length ? <PhotoStrip size="md" photos={photoRefs(pod.photoIds, db.photos, "Driver at the stop")} /> : <p className="text-xs text-muted">No photos taken at the stop.</p>}
          </section>
        )}
        <section className="grid gap-2.5">
          <h3 className="flex items-center gap-2 font-bold"><ClipboardCheck className="size-4" /> Store receipt</h3>
          {r ? (
            <>
              <p className="text-sm text-ink-2">Confirmed by {r.by} at {fmtClock(r.confirmedAt)}</p>
              <ReceiptLines r={r} all />
              {r.issues.length > 0 && (
                <ul className="grid gap-1 text-sm">
                  {r.issues.map((i, k) => <li key={k} className="flex gap-2"><Pill tone="warning">{i.type}</Pill><span className="text-ink-2">{i.note}</span></li>)}
                </ul>
              )}
              {r.photoIds?.length ? <PhotoStrip size="md" photos={photoRefs(r.photoIds, db.photos, "Store at receipt")} /> : <p className="text-xs text-muted">The store added no photos.</p>}
            </>
          ) : (
            <p className="text-sm text-ink-2">{s.deliveredAt ? "The store hasn’t confirmed what arrived yet." : "Not delivered yet."}</p>
          )}
        </section>
      </div>
    </Drawer>
  );
}
