"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Check, ChevronRight, ClipboardCheck, Clock, MapPin, Navigation, Package, Snowflake } from "lucide-react";
import { useDriver } from "@/components/driver/driver-context";
import { DriverSync, OfflineBanner, RunChangeBanner } from "@/components/driver/bits";
import { AppBar, BrandPill, Button, Card, Empty, Pill, Seg, btnClass, cx } from "@/components/ui";
import { toast } from "@/components/toast";
import { net, outletName } from "@waypoint/core/reference";
import { fmtMin } from "@waypoint/core/domain/time";
import { newId } from "@/lib/offline/outbox";
import { useSession } from "@/lib/session";
import { demoStamp, depotOfVehicle, mapsUrl } from "@waypoint/core/views";
import { RunMap } from "@/components/driver/run-map";

export default function Run() {
  const d = useDriver();
  const [session] = useSession();
  const router = useRouter();
  const [tripIdx, setTripIdx] = useState<number | null>(null);

  const first = session?.name.split(" ")[0] ?? "";
  const all = d.trips.flatMap((t) => t.stops);
  const doneCount = all.filter((s) => d.stops[s.orderId]?.deliveredAt || d.stops[s.orderId]?.problem).length;
  const currentTrip = d.trips.findIndex((t) => t.stops.some((s) => !d.stops[s.orderId]?.deliveredAt && !d.stops[s.orderId]?.problem));
  const ti = tripIdx ?? Math.max(0, currentTrip);
  const trip = d.trips[ti];

  const header = (
    <AppBar dark title={`Good morning, ${first}`} sub={`${d.vehicleId} · ${doneCount} of ${all.length} delivered`} right={<DriverSync />} progress={all.length ? doneCount / all.length : undefined} />
  );

  if (!d.trips.length) {
    return (
      <>
        {header}
        <OfflineBanner />
        <Empty icon={ClipboardCheck} title={d.published ? "No stops for you today" : "No run published yet"}>
          {d.published ? "Your vehicle has no trips in today’s plan." : "Dispatch publishes tomorrow’s plan after the 16:00 cutoff. Your run will appear here — and stays available with no signal once downloaded."}
        </Empty>
      </>
    );
  }

  const stops = trip.stops;
  const next = stops.find((s) => !d.stops[s.orderId]?.deliveredAt && !d.stops[s.orderId]?.problem);
  const loadState = d.loadStatus[trip.trip.id];

  const arrive = async (orderId: string, eta: number) => {
    await d.record({ id: newId(), vehicleId: d.vehicleId, kind: "arrived", orderId, at: demoStamp(eta, orderId), recordedAt: new Date().toISOString() });
    toast.success(d.online ? "Arrival recorded" : "Arrival saved on this phone");
    router.push(`/driver/stop/${orderId}`);
  };

  return (
    <>
      {header}
      <OfflineBanner />
      <RunChangeBanner />
      <div className="grid gap-3 p-4">
        {d.trips.length > 1 && (
          <Seg big fill value={String(ti)} onChange={(v) => setTripIdx(Number(v))} options={d.trips.map((t, i) => ({ value: String(i), label: `Trip ${t.trip.tripNo} · ${t.trip.district}` }))} />
        )}

        {loadState && loadState !== "released" && (
          <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-soft p-3.5 text-sm">
            <Package className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>
              <b>Not released from the dock yet</b> — the loader is {loadState === "held" ? "holding for dispatch (shortfall)" : "still loading"}. Departure {fmtMin(trip.depart)}.
            </span>
          </div>
        )}

        <RunMap
          key={trip.trip.id}
          tripId={trip.trip.id}
          depot={depotOfVehicle(d.vehicleId)}
          online={d.online}
          nextId={next?.orderId}
          stops={stops.map((s) => ({ orderId: s.orderId, outletId: s.outletId, arrive: s.arrive, done: !!(d.stops[s.orderId]?.deliveredAt || d.stops[s.orderId]?.problem) }))}
        />

        {next ? (
          <NextStop key={next.orderId} orderId={next.orderId} eta={next.arrive} index={stops.indexOf(next)} total={stops.length} arrived={!!d.stops[next.orderId]?.arrivedAt} onArrive={arrive} />
        ) : (
          <Card className="flex items-center gap-3 border-success/30 bg-success-soft p-4">
            <span className="flex size-10 items-center justify-center rounded-full bg-success text-white"><Check className="size-5" strokeWidth={3} /></span>
            <div>
              <p className="font-bold">Trip {trip.trip.tripNo} complete</p>
              <p className="text-sm text-ink-2">Return to depot · back ~{fmtMin(trip.returnAt)}</p>
            </div>
          </Card>
        )}

        <Card className="overflow-hidden">
          <h2 className="flex items-baseline justify-between px-4 pb-1 pt-3.5 text-sm font-bold">
            Trip {trip.trip.tripNo} · {trip.trip.district}
            <span className="text-xs font-medium text-ink-2">departs {fmtMin(trip.depart)}</span>
          </h2>
          <ol>
            {stops.map((s, i) => {
              const rec = d.stops[s.orderId];
              const o = net.outlets.get(s.outletId)!;
              const done = !!rec?.deliveredAt;
              const failed = !!rec?.problem;
              const cur = next?.orderId === s.orderId;
              const passed = done || failed;
              const last = i === stops.length - 1;
              return (
                <li key={s.orderId}>
                  <Link href={`/driver/stop/${s.orderId}`} className={cx("group relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-canvas", cur && "bg-primary-soft/70 hover:bg-primary-soft")}>
                    {/* The route spine: segments turn green behind the driver as stops are completed. */}
                    {i > 0 && <span aria-hidden className={cx("absolute left-[30.5px] top-0 h-1/2 w-[3px]", passed || cur ? "bg-success" : "bg-line")} />}
                    {!last && <span aria-hidden className={cx("absolute bottom-0 left-[30.5px] h-1/2 w-[3px]", passed ? "bg-success" : "bg-line")} />}
                    <span
                      className={cx(
                        "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ring-4",
                        done ? "bg-success text-white ring-surface" : failed ? "bg-danger text-white ring-surface" : cur ? "animate-waypoint bg-primary text-white ring-primary-soft" : "border-2 border-line-strong bg-surface text-ink-2 ring-surface",
                      )}
                    >
                      {done ? <Check className="size-4" strokeWidth={3} /> : failed ? "!" : i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cx("block truncate text-[15px] font-semibold", passed && "text-ink-2")}>{outletName(s.outletId)}</span>
                      <span className={cx("block text-xs", failed ? "font-medium text-danger" : "text-ink-2")}>
                        {done ? `Delivered ${rec!.deliveredAt}` : failed ? `Not delivered · ${rec!.problem!.reason}` : `ETA ${fmtMin(s.arrive)} · window ${o.windowOpen}–${o.windowClose}`}
                      </span>
                    </span>
                    {rec?.pending && <Pill tone="warning" icon={Clock}>On phone</Pill>}
                    <ChevronRight className="size-5 text-muted transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>
    </>
  );
}

function NextStop({ orderId, eta, index, total, arrived, onArrive }: { orderId: string; eta: number; index: number; total: number; arrived: boolean; onArrive: (id: string, eta: number) => void }) {
  const d = useDriver();
  const trip = d.trips.find((t) => t.stops.some((s) => s.orderId === orderId))!;
  const order = trip.orders.find((o) => o.id === orderId)!;
  const o = net.outlets.get(order.outletId)!;
  return (
    <section className="overflow-hidden rounded-2xl bg-surface shadow-raised ring-1 ring-line" aria-label="Next stop">
      <div className="on-ink relative grid gap-3 bg-navy p-4 pb-5 text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_120%_at_100%_0%,rgb(20_184_166/0.28),transparent_60%)]" />
        <div className="relative flex items-center gap-2">
          <span className="rounded-full bg-mint px-2.5 py-1 text-[11px] font-bold tracking-wide text-navy">NEXT · STOP {index + 1} OF {total}</span>
          {!d.online && <Pill tone="warning">ETA estimated</Pill>}
        </div>
        <div className="relative">
          <h2 className="text-[26px] font-bold leading-tight tracking-tight">{outletName(o.id)}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-on-ink-muted">
            <BrandPill brand={o.brand} /> {o.id} · {o.district}
            {order.temp === "chilled" && <Pill tone="chilled" icon={Snowflake}>Chilled</Pill>}
          </p>
        </div>
        <div className="relative grid grid-cols-[auto_auto_auto] justify-between gap-3 border-t border-white/10 pt-3">
          {[
            ["ETA", fmtMin(eta)],
            ["Window", `${o.windowOpen}–${o.windowClose}`],
            ["Dock", o.dockType === "rear_dock" ? "Rear" : o.dockType === "street" ? "Street" : "Mall bay"],
          ].map(([k, v], i) => (
            <div key={k} className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-on-ink-muted">{k}</div>
              <div className={cx("whitespace-nowrap font-bold tabular-nums tracking-tight", i === 0 ? "text-2xl text-mint" : "text-lg")}>{v}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-3 p-4">
        {o.parking === "van_only" && <p className="flex items-center gap-1.5 rounded-lg bg-warning-soft px-3 py-2 text-sm font-semibold text-warning"><AlertTriangle className="size-4" /> Narrow access — van only</p>}
        <div className="grid grid-cols-2 gap-2.5">
          <a href={mapsUrl(o.id)} target="_blank" rel="noreferrer" className={btnClass("secondary", "big")}>
            <Navigation className="size-5" /> Navigate
          </a>
          {arrived ? (
            <Link href={`/driver/stop/${orderId}/pod`} className={btnClass("primary", "big")}>
              <ClipboardCheck className="size-5" /> Deliver
            </Link>
          ) : (
            <Button big icon={MapPin} onClick={() => onArrive(orderId, eta)}>Arrived</Button>
          )}
        </div>
      </div>
    </section>
  );
}
