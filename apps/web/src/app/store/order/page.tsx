"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, CheckCircle2, Clock, Info, Snowflake } from "lucide-react";
import { Button, Card, Pill, Seg, Spinner, Stepper, btnClass, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { DEMO_DATE, net, outletName } from "@waypoint/core/reference";
import { CATALOG } from "@waypoint/core/domain/catalog";
import { fmtDate } from "@waypoint/core/domain/time";
import type { Order, Temp } from "@waypoint/core/domain/types";
import { useAct, useDb } from "@/lib/hooks";
import { useSession } from "@/lib/session";

export default function NewOrderPage() {
  const [session] = useSession();
  const outlet = session?.outletId ? net.outlets.get(session.outletId) : undefined;
  // The form's defaults depend on the outlet, so it mounts once the session has loaded.
  return outlet ? <NewOrder key={outlet.id} outletId={outlet.id} /> : <Spinner />;
}

function NewOrder({ outletId }: { outletId: string }) {
  const { data: db } = useDb();
  const [session] = useSession();
  const { run, busy } = useAct();
  const outlet = net.outlets.get(outletId)!;
  const [temp, setTemp] = useState<Temp>(outlet.brand === "Fresh" ? "chilled" : "ambient");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [done, setDone] = useState<Order | null>(null);
  const items = useMemo(() => CATALOG.filter((c) => c.brand === outlet.brand && (outlet.brand !== "Fresh" || c.temp === temp)), [outlet.brand, temp]);
  if (!db) return <Spinner />;

  const closed = db.day[outlet.depot].ordersClosed;
  const lines = items.map((i) => ({ i, q: qty[i.id] ?? 0 })).filter((x) => x.q > 0);
  const vol = lines.reduce((s, x) => s + x.q * x.i.volumeM3, 0);
  const kg = lines.reduce((s, x) => s + x.q * x.i.weightKg, 0);
  const existing = db.orders.filter((o) => o.outletId === outletId && o.forDate === DEMO_DATE);

  if (done)
    return (
      <div className="mx-auto grid max-w-lg gap-4 p-6 text-center">
        <span className="mx-auto flex size-20 animate-rise items-center justify-center rounded-full bg-success-soft ring-8 ring-success-soft/50">
          <CheckCircle2 className="size-11 text-success" />
        </span>
        <h1 className="text-[28px] font-bold tracking-tight">Order {done.id} confirmed</h1>
        <p className="text-ink-2">
          {done.units} units · {done.volumeM3.toFixed(2)} m³ · {done.temp}. {done.forDate === "next-run" ? "It arrived after today’s cutoff, so it will be planned on the next run." : `It is in tonight’s planning queue for delivery ${outlet.windowOpen}–${outlet.windowClose}.`}
        </p>
        <div className="flex justify-center gap-2">
          <Link href="/store" className={btnClass()}>Track deliveries</Link>
          <Button kind="secondary" onClick={() => { setDone(null); setQty({}); }}>Place another</Button>
        </div>
      </div>
    );

  return (
    <div className="grid gap-5 p-4 sm:p-7 lg:grid-cols-[1fr_340px]">
      <Card className="grid content-start gap-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[24px] font-bold tracking-tight">Order for {fmtDate(DEMO_DATE, { weekday: "short", day: "numeric", month: "short" })}</h1>
          {outlet.brand === "Fresh" && (
            <div className="ml-auto">
              <Seg value={temp} onChange={(v) => { setTemp(v); setQty({}); }} options={[{ value: "ambient", label: "Dry groceries" }, { value: "chilled", label: "Chilled" }]} />
            </div>
          )}
        </div>
        {existing.length > 0 && (
          <p className="flex items-center gap-2 rounded-[10px] bg-success-soft p-3 text-sm">
            <Check className="size-4 text-success" /> Already confirmed for this day: {existing.map((o) => `${o.id} (${o.temp})`).join(", ")}
          </p>
        )}
        {closed && (
          <p className="flex items-center gap-2 rounded-[10px] bg-warning-soft p-3 text-sm">
            <Clock className="size-4 text-warning" /> Orders for this day closed at 16:00. Anything you submit now goes on the next run.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2 text-right">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className={cx("border-t border-line transition-colors", (qty[i.id] ?? 0) > 0 ? "bg-primary-soft/50" : "hover:bg-canvas")}>
                  <td className="px-3 py-2.5 font-semibold">
                    {i.temp === "chilled" && <Snowflake className="mr-1.5 inline size-3.5 text-chilled" />}
                    {i.name}
                  </td>
                  <td className="px-3 py-2.5 text-ink-2">{i.unit}</td>
                  <td className="px-3 py-2 text-right">
                    <Stepper value={qty[i.id] ?? 0} onChange={(v) => setQty((s) => ({ ...s, [i.id]: v }))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="grid content-start gap-3 p-5 shadow-raised lg:sticky lg:top-24">
        <h2 className="text-[17px] font-bold">{temp === "chilled" ? "Chilled" : "Dry"} order summary</h2>
        {[
          ["Lines", `${lines.length} items · ${lines.reduce((s, x) => s + x.q, 0)} units`],
          ["Volume", `${vol.toFixed(2)} m³`],
          ["Weight", `${Math.round(kg)} kg`],
          ["Delivery", `${outletName(outletId)} · ${outlet.mallWindow ?? `${outlet.windowOpen}–${outlet.windowClose}`}`],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 text-sm">
            <span className="text-ink-2">{k}</span>
            <span className="text-right font-semibold">{v}</span>
          </div>
        ))}
        {temp === "chilled" && <Pill tone="chilled" icon={Snowflake} lg>Needs a refrigerated vehicle</Pill>}
        <p className="flex gap-2 rounded-[10px] bg-warning-soft p-3 text-xs">
          <Info className="size-4 shrink-0 text-warning" /> Refrigerated capacity is tight before Christmas. If we can’t fit everything, you’ll hear why before loading starts, and you’ll be first on the next run.
        </p>
        <Button
          big
          icon={Check}
          disabled={!lines.length}
          busy={busy}
          onClick={async () => {
            const o = await run(() => api.placeOrder({ outletId, date: DEMO_DATE, temp: outlet.brand === "Fresh" ? temp : "ambient", lines: lines.map((x) => ({ skuId: x.i.id, qty: x.q })), by: session?.name ?? "Store" }));
            if (o) setDone(o);
          }}
        >
          Submit order
        </Button>
      </Card>
    </div>
  );
}
