"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { AlertTriangle, ArrowLeft, Check, Layers, Lock, Package, Snowflake, Unlock } from "lucide-react";
import { Button, Card, Meter, Pill, Spinner, Stepper, btnClass, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { outletName } from "@waypoint/core/reference";
import { linesFor } from "@waypoint/core/domain/catalog";
import { fmtMin } from "@waypoint/core/domain/time";
import { useAct, useDb } from "@/lib/hooks";
import { dockTrips, LOAD_LABEL } from "@waypoint/core/loading";
import { useSession } from "@/lib/session";

export default function LoadList() {
  const { tripId } = useParams<{ tripId: string }>();
  const { data: db } = useDb();
  const [session] = useSession();
  const { run, busy } = useAct();
  const depot = session?.depot ?? "Peliyagoda";
  const t = useMemo(() => (db ? dockTrips(db, depot, Infinity).find((x) => x.te.trip.id === tripId) : undefined), [db, depot, tripId]);
  if (!db) return <Spinner />;
  if (!t) return <p className="p-6">This trip is no longer in the published plan. <Link className="font-semibold text-primary" href="/loader">Back to the dock queue</Link></p>;

  const { te, load } = t;
  const reversed = [...te.stops].reverse(); // last stop is loaded first, deepest in the truck
  const shortfalls = db.shortfalls.filter((s) => s.tripId === tripId);
  const stopDone = (orderId: string) => Object.entries(load.lines).filter(([k]) => k.startsWith(orderId + "|")).every(([, l]) => l.loaded >= l.planned);
  const current = reversed.find((s) => !stopDone(s.orderId));
  const flagged = new Set(shortfalls.map((s) => `${s.orderId}|${s.skuId}`));
  const open = Object.entries(load.lines).filter(([k, l]) => l.loaded < l.planned && !flagged.has(k)).length;
  const canRelease = open === 0 && load.status !== "released" && load.status !== "held";

  return (
    <div className="pb-28">
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-3.5 sm:px-6">
        <Link href="/loader" aria-label="Back" className="-ml-1.5 flex size-10 items-center justify-center rounded-xl transition-colors hover:bg-subtle"><ArrowLeft className="size-6" /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight">{te.vehicle.id} · Trip {te.trip.tripNo} · {te.trip.brand} {te.trip.district}</h1>
          <p className="text-[13px] text-ink-2">Bay {t.bay} · departs {fmtMin(te.depart)} · {te.stops.length} stops · {te.volumeM3.toFixed(1)} of {te.vehicle.volumeCapM3} m³</p>
        </div>
        <Pill tone="primary" icon={Layers} lg>Load last stop first</Pill>
      </header>

      {load.status === "held" && (
        <div className="mx-4 mt-4 flex items-center gap-3 rounded-xl border border-danger/40 bg-danger-soft p-4 ring-2 ring-danger/15 sm:mx-6">
          <Lock className="size-5 text-danger" />
          <p className="text-sm"><b>Held for the dispatcher.</b> They are choosing how to resolve the shortfall; this screen updates as soon as they decide.</p>
        </div>
      )}
      {load.status === "released" && (
        <div className="mx-4 mt-4 flex items-center gap-3 rounded-xl bg-success-soft p-4 sm:mx-6">
          <Check className="size-5 text-success" />
          <p className="text-sm font-semibold text-success">Released{load.releasedBy ? ` by ${load.releasedBy}` : ""}. The driver’s run is unlocked.</p>
        </div>
      )}

      <div className="grid gap-4 p-4 sm:p-6 md:grid-cols-[240px_1fr]">
        <Card className="hidden content-start gap-2 p-3 md:grid">
          <h2 className="text-sm font-bold">Truck layout</h2>
          <div className="rounded-t-2xl rounded-b-md bg-navy py-2.5 text-center text-[11px] font-bold tracking-widest text-white">CAB · FRONT</div>
          {reversed.map((s) => {
            const done = stopDone(s.orderId);
            const cur = current?.orderId === s.orderId;
            return (
              <div key={s.orderId} className={cx("flex items-center gap-2 rounded-lg px-2.5 py-3 text-xs transition-colors", done ? "bg-success-soft" : cur ? "bg-primary-soft ring-2 ring-primary" : "bg-subtle text-ink-2")}>
                <b className={done ? "text-success" : cur ? "text-primary-strong" : ""}>S{s.seq + 1}</b>
                <span className="flex-1 truncate font-medium">{outletName(s.outletId)}</span>
                {done && <Check className="size-3.5 text-success" />}
              </div>
            );
          })}
          <div className="rounded-lg border border-dashed border-line-strong py-2 text-center text-[11px] font-bold tracking-widest text-muted">REAR DOOR · UNLOAD</div>
        </Card>

        <Card className="overflow-hidden">
          <div className="grid gap-2 p-4">
            <div className="flex items-center">
              <h2 className="font-bold">Checklist</h2>
              <span className="ml-auto text-sm font-semibold text-ink-2">{t.loaded} of {t.planned} units · {LOAD_LABEL[load.status]}</span>
            </div>
            <Meter pct={(t.loaded / t.planned) * 100} tone={t.loaded >= t.planned ? "success" : "primary"} className="h-2.5" />
          </div>
          {reversed.map((s, i) => {
            const order = te.orders.find((o) => o.id === s.orderId)!;
            const cur = current?.orderId === s.orderId;
            const ord = i === 0 ? "1st in" : i === reversed.length - 1 ? "Last in · by door" : `${i + 1}${["st", "nd", "rd"][i] ?? "th"} in`;
            return (
              <section key={s.orderId} className={cx("grid gap-1 border-t border-line px-4 py-3.5 transition-colors", cur && "bg-primary-soft/60")}>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={cur ? "primary" : "neutral"} solid={cur}>{ord}</Pill>
                  <span className="font-bold">Stop {s.seq + 1} · {outletName(s.outletId)}</span>
                  <span className="text-xs text-muted">{s.outletId}</span>
                </div>
                {linesFor(order).map((l) => {
                  const key = `${order.id}|${l.skuId}`;
                  const line = load.lines[key];
                  if (!line) return null;
                  const sf = shortfalls.find((x) => x.orderId === order.id && x.skuId === l.skuId);
                  const done = line.loaded >= line.planned;
                  const locked = load.status === "released" || load.status === "held";
                  return (
                    <div key={key} className="flex items-center gap-3 py-1.5">
                      <button
                        aria-label={done ? `Unmark ${l.name}` : `Mark ${l.name} loaded`}
                        disabled={locked || busy}
                        onClick={() => run(() => api.setLoadLine(tripId, key, done ? 0 : line.planned))}
                        className={cx("flex size-11 shrink-0 items-center justify-center rounded-xl border-2 font-bold transition-[background-color,border-color,transform] duration-150 active:scale-95", done ? "border-success bg-success text-white" : sf ? "border-warning bg-warning text-white" : "border-line-strong bg-surface hover:border-primary hover:bg-primary-soft")}
                      >
                        {done ? <Check className="size-6" strokeWidth={3} /> : sf ? <AlertTriangle className="size-5" /> : null}
                      </button>
                      {order.temp === "chilled" ? <Snowflake className="size-[18px] text-chilled" /> : <Package className="size-[18px] text-muted" />}
                      <span className={cx("min-w-0 flex-1 text-[15px] font-medium", done && "text-ink-2")}>
                        {l.name} <span className="text-xs text-muted">· {l.unit}</span>
                        {sf && <Pill tone="warning" className="ml-2">Short {sf.planned - sf.loaded} · flagged</Pill>}
                      </span>
                      <Stepper value={line.loaded} max={line.planned} tone={sf ? "warning" : undefined} onChange={(v) => !locked && run(() => api.setLoadLine(tripId, key, v))} />
                    </div>
                  );
                })}
              </section>
            );
          })}
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 p-3 shadow-[0_-8px_24px_-12px_rgb(12_30_43/0.18)] backdrop-blur sm:p-4">
        <div className="mx-auto grid max-w-6xl gap-2 sm:grid-cols-2">
          <Link href={`/loader/${tripId}/flag`} aria-disabled={load.status === "released" || load.status === "held"} className={cx(btnClass("warn", "big"), (load.status === "released" || load.status === "held") && "pointer-events-none opacity-45 shadow-none")}>
            <AlertTriangle className="size-5" /> Flag shortfall / damage
          </Link>
          <Button big icon={canRelease ? Unlock : Lock} disabled={!canRelease} busy={busy} onClick={() => run(() => api.releaseTrip(tripId, session?.name ?? "Loader"), `${te.vehicle.id} released — driver notified`)}>
            {load.status === "released" ? "Released" : canRelease ? "Release vehicle" : `Release vehicle (${open} line${open > 1 ? "s" : ""} left)`}
          </Button>
        </div>
      </div>
    </div>
  );
}
