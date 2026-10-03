"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { AlertTriangle, Check, Layers, Lock, Package, Snowflake, Unlock, WifiOff } from "lucide-react";
import { AppBar, Button, Empty, Pill, Spinner, Stepper, btnClass, cx } from "@/components/ui";
import { LoaderSync } from "@/components/loader/bits";
import { useLoader } from "@/components/loader/loader-context";
import { api } from "@/lib/api";
import { useAct } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { outletName } from "@waypoint/core/reference";
import { linesFor } from "@waypoint/core/domain/catalog";
import { fmtMin } from "@waypoint/core/domain/time";
import { dockTrips, LOAD_LABEL } from "@waypoint/core/loading";

export default function LoadList() {
  const { tripId } = useParams<{ tripId: string }>();
  const { db, connected, tick, rejected, dismissRejected, queued, drain } = useLoader();
  const [session] = useSession();
  const { run, busy } = useAct();
  const depot = session?.depot ?? "Peliyagoda";
  const t = useMemo(() => (db ? dockTrips(db, depot, Infinity).find((x) => x.te.trip.id === tripId) : undefined), [db, depot, tripId]);
  if (!db) return <Spinner />;
  if (!t)
    return (
      <>
        <AppBar back="/loader" title="Load list" />
        <Empty icon={Package} title="Not in the published plan">
          Dispatch may have moved this trip. <Link className="font-semibold text-primary" href="/loader">Back to the dock queue</Link>
        </Empty>
      </>
    );

  const { te, load } = t;
  const reversed = [...te.stops].reverse(); // last stop is loaded first, deepest in the truck
  const shortfalls = db.shortfalls.filter((s) => s.tripId === tripId);
  const stopDone = (orderId: string) => Object.entries(load.lines).filter(([k]) => k.startsWith(orderId + "|")).every(([, l]) => l.loaded >= l.planned);
  const current = reversed.find((s) => !stopDone(s.orderId));
  const flagged = new Set(shortfalls.map((s) => `${s.orderId}|${s.skuId}`));
  const open = Object.entries(load.lines).filter(([k, l]) => l.loaded < l.planned && !flagged.has(k)).length;
  const locked = load.status === "released" || load.status === "held";
  const canRelease = open === 0 && !locked;
  const refused = rejected.filter((r) => r.tripId === tripId);

  return (
    <>
      <AppBar
        back="/loader"
        title={`${te.vehicle.id} · Trip ${te.trip.tripNo}`}
        sub={`Bay ${t.bay} · departs ${fmtMin(te.depart)} · ${te.trip.brand} ${te.trip.district}`}
        right={<LoaderSync />}
        progress={t.loaded / t.planned}
      />

      <div className="grid gap-3 p-4">
        {load.status === "held" && (
          <p className="flex items-center gap-3 rounded-xl border border-danger/40 bg-danger-soft p-3.5 text-sm ring-2 ring-danger/15">
            <Lock className="size-5 shrink-0 text-danger" /> <span><b>Held for the dispatcher.</b> They are choosing how to resolve the shortfall; this screen updates as soon as they decide.</span>
          </p>
        )}
        {load.status === "released" && (
          <p className="flex items-center gap-3 rounded-xl bg-success-soft p-3.5 text-sm font-semibold text-success">
            <Check className="size-5 shrink-0" /> Released{load.releasedBy ? ` by ${load.releasedBy}` : ""}. The driver’s run is unlocked.
          </p>
        )}
        {refused.length > 0 && (
          <div className="grid gap-1.5 rounded-xl border border-danger/40 bg-danger-soft p-3.5 text-sm">
            <p className="font-bold text-danger">{refused.length} tick{refused.length > 1 ? "s" : ""} not accepted</p>
            <p className="text-ink-2">{refused[0].rejectedReason} Check the list against the truck.</p>
            <button className="justify-self-start font-semibold text-primary" onClick={() => void dismissRejected(tripId)}>Dismiss</button>
          </div>
        )}

        <section aria-label="Truck layout" className="grid gap-1.5">
          <div className="flex items-center gap-2">
            <Pill tone="primary" icon={Layers}>Load last stop first</Pill>
            <span className="ml-auto text-xs font-semibold tabular-nums text-ink-2">{t.loaded}/{t.planned} units · {LOAD_LABEL[load.status]}</span>
          </div>
          <ol className="flex items-stretch gap-1 overflow-x-auto rounded-xl bg-surface p-1.5 shadow-card ring-1 ring-line">
            <li className="flex shrink-0 items-center rounded-lg bg-navy [.dark_&]:bg-navy-3 px-2 text-[10px] font-bold tracking-widest text-white [writing-mode:vertical-rl] rotate-180">CAB</li>
            {reversed.map((s) => {
              const done = stopDone(s.orderId);
              const cur = current?.orderId === s.orderId;
              return (
                <li key={s.orderId} className={cx("flex min-w-14 shrink-0 flex-col items-center justify-center rounded-lg px-2 py-2 text-xs", done ? "bg-success-soft text-success" : cur ? "bg-primary-soft text-primary-strong ring-2 ring-primary" : "bg-subtle text-ink-2")}>
                  <b>S{s.seq + 1}</b>
                  {done ? <Check className="size-3.5" /> : <span className="text-[10px] tabular-nums">{te.stops.length - s.seq}{["st", "nd", "rd"][te.stops.length - s.seq - 1] ?? "th"} in</span>}
                </li>
              );
            })}
            <li className="flex shrink-0 items-center rounded-lg border border-dashed border-line-strong px-2 text-[10px] font-bold tracking-widest text-muted [writing-mode:vertical-rl] rotate-180">DOOR</li>
          </ol>
        </section>

        {reversed.map((s) => {
          const order = te.orders.find((o) => o.id === s.orderId)!;
          const cur = current?.orderId === s.orderId;
          return (
            <section key={s.orderId} aria-label={`Stop ${s.seq + 1} ${outletName(s.outletId)}`} className={cx("overflow-hidden rounded-2xl bg-surface shadow-card ring-1", cur ? "ring-2 ring-primary" : "ring-line")}>
              <div className={cx("flex items-center gap-2 px-4 py-2.5", cur ? "bg-primary-soft" : "bg-subtle/60")}>
                <span className="font-bold">Stop {s.seq + 1} · {outletName(s.outletId)}</span>
                {order.temp === "chilled" && <Snowflake className="size-4 text-chilled" aria-label="Chilled" />}
                <span className="ml-auto text-xs text-muted">{s.outletId}</span>
              </div>
              <ul>
                {linesFor(order).map((l) => {
                  const key = `${order.id}|${l.skuId}`;
                  const line = load.lines[key];
                  if (!line) return null;
                  const sf = shortfalls.find((x) => x.orderId === order.id && x.skuId === l.skuId);
                  const done = line.loaded >= line.planned;
                  return (
                    <li key={key} className="flex items-center gap-3 border-t border-line px-3 py-2.5">
                      <button
                        aria-label={done ? `Unmark ${l.name}` : `Mark ${l.name} loaded`}
                        disabled={locked}
                        onClick={() => void tick(tripId, key, done ? 0 : line.planned)}
                        className={cx("flex size-12 shrink-0 items-center justify-center rounded-xl border-2 font-bold transition-[background-color,border-color,transform] duration-150 active:scale-95 disabled:opacity-60", done ? "border-success bg-success text-on-primary" : sf ? "border-warning bg-warning text-white" : "border-line-strong bg-surface")}
                      >
                        {done ? <Check className="size-6" strokeWidth={3} /> : sf ? <AlertTriangle className="size-5" /> : null}
                      </button>
                      <span className={cx("min-w-0 flex-1 text-[15px] font-medium leading-snug", done && "text-ink-2")}>
                        {l.name}
                        <span className="block text-xs text-muted">{l.unit}{sf ? ` · short ${sf.planned - sf.loaded}, flagged` : ""}</span>
                      </span>
                      <Stepper value={line.loaded} max={line.planned} tone={sf ? "warning" : undefined} onChange={(v) => !locked && void tick(tripId, key, v)} />
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto grid max-w-md gap-2 border-t border-line bg-surface/95 px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 shadow-[0_-8px_24px_-12px_rgb(12_30_43/0.18)] backdrop-blur">
        {!connected && !locked && (
          <p className="flex items-center justify-center gap-1.5 text-xs font-semibold text-warning"><WifiOff className="size-3.5" /> Ticks are saved on this phone. Flagging and release need signal.</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/loader/${tripId}/flag`} aria-disabled={locked || !connected} className={cx(btnClass("warn", "big"), "px-3", (locked || !connected) && "pointer-events-none opacity-45 shadow-none")}>
            <AlertTriangle className="size-5" /> Flag shortfall
          </Link>
          <Button big className="px-3" icon={canRelease ? Unlock : Lock} disabled={!canRelease || !connected || queued > 0} busy={busy} onClick={() => run(async () => {
            if (!(await drain())) throw new Error("Some ticks haven’t reached the server yet. Try again when you have signal.");
            return api.releaseTrip(tripId);
          }, `${te.vehicle.id} released — driver notified`)}>
            {load.status === "released" ? "Released" : !canRelease ? `${open} line${open > 1 ? "s" : ""} left` : queued ? "Syncing…" : "Release"}
          </Button>
        </div>
      </div>
    </>
  );
}
