"use client";
import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, Bell, Check, ClipboardCheck, Clock, KeyRound, Phone, Snowflake, Timer, Truck } from "lucide-react";
import { Button, Card, Empty, Pill, Spinner, btnClass, cx, type Tone } from "@/components/ui";
import { api, type Notice } from "@/lib/api";
import { DEMO_DATE, net, outletName } from "@waypoint/core/reference";
import { fmtDate, fmtMin } from "@waypoint/core/domain/time";
import { useAct, useDb, useNow } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { orderState, STATUS_LABEL, vehicleTrips, type OrderState, type OrderStatus } from "@waypoint/core/views";
import { liveRun, type LiveStop } from "@waypoint/core/live";
import type { Db } from "@/lib/api";
import { CALL } from "@/lib/contacts";

const TONE: Record<OrderStatus, Tone> = {
  confirmed: "neutral", planned: "info", deferred: "danger", loading: "info", on_the_way: "info", arrived: "info",
  delivered: "success", failed: "danger", received: "success", next_run: "warning",
};
const STEPS: [OrderStatus[], string][] = [
  [["confirmed"], "Confirmed"],
  [["planned"], "Planned"],
  [["loading"], "Loading"],
  [["on_the_way", "arrived"], "On the way"],
  [["delivered", "failed"], "Delivered"],
  [["received"], "Received"],
];

export default function Deliveries() {
  const { data: db } = useDb();
  const [session] = useSession();
  const { run, busy } = useAct();
  const outletId = session?.outletId;
  const outlet = outletId ? net.outlets.get(outletId) : undefined;

  const states = useMemo(() => (db && outletId ? db.orders.filter((o) => o.outletId === outletId).map((o) => orderState(db, o.id)) : []), [db, outletId]);
  const now = useNow(15_000);
  // Each order's stop as the truck is actually going: travel plus the expected unloading at earlier stops.
  const live = useMemo(() => (db ? liveStops(db, states, now) : {}), [db, states, now]);
  if (!db || !outlet || !outletId) return <Spinner />;
  const notices = db.notices.filter((n) => n.outletId === outletId);
  const actionable = notices.filter((n) => (n.kind === "deferral" || n.kind === "late") && !n.acknowledged);
  const coming = states.filter((s) => ["planned", "loading", "on_the_way", "arrived"].includes(s.status) && s.eta != null).sort((a, b) => (live[a.order.id]?.arrive ?? a.eta!) - (live[b.order.id]?.arrive ?? b.eta!));
  const next = coming[0];
  const nextLive = next ? live[next.order.id] : undefined;

  return (
    <div className="grid gap-5 p-4 sm:p-7 lg:grid-cols-[1fr_320px]">
      <div className="grid content-start gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Deliveries</h1>
          <p className="text-sm text-ink-2">{outlet.brand} · {outletName(outletId)} · {outlet.district} · window {outlet.mallWindow ?? `${outlet.windowOpen}–${outlet.windowClose}`}</p>
        </div>

        {actionable.map((n) =>
          n.kind === "late" ? (
            <LateNotice key={n.id} n={n} busy={busy} onAck={(r) => run(() => api.ackNotice(n.id, r), r === "ok" ? "Thanks — dispatch knows the new time works for you" : "Dispatch will call you to agree a smaller drop")} />
          ) : (
            <DeferralNotice key={n.id} n={n} busy={busy} onAck={(r) => run(() => api.ackNotice(n.id, r), r === "ok" ? "Thanks — dispatch can see you’ve acknowledged" : "Dispatch will prioritise essentials on the next run")} />
          ),
        )}

        {states.length === 0 && (
          <Card>
            <Empty icon={ClipboardCheck} title="No orders for this outlet today">
              <Link className="font-semibold text-primary" href="/store/order">Place an order</Link> before the 16:00 cutoff.
            </Empty>
          </Card>
        )}
        {states.map((s) => (
          <OrderCard key={s.order.id} s={s} live={live[s.order.id]} />
        ))}
      </div>

      <aside className="grid content-start gap-4">
        <section className="on-ink relative grid gap-1.5 overflow-hidden rounded-2xl bg-navy p-5 text-white shadow-raised">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_120%_at_100%_0%,rgb(20_184_166/0.3),transparent_60%)]" />
          <span className="relative text-xs font-semibold text-on-ink-muted">Receiving {fmtDate(DEMO_DATE, { weekday: "short", day: "numeric", month: "short" })}</span>
          {next ? (
            <>
              {next.status === "arrived" ? (
                <span className="relative text-[34px] font-bold leading-tight tracking-tight text-mint">Driver is here</span>
              ) : nextLive?.minutesAway != null ? (
                <span className="relative" aria-live="polite">
                  <span className="block text-sm font-semibold text-white/85">Arriving in</span>
                  <span className="block text-[40px] font-bold leading-none tracking-tight tabular-nums text-mint">{away(nextLive.minutesAway)}</span>
                  <span className="mt-1 block text-sm tabular-nums text-white/85">around {fmtMin(nextLive.arrive)}</span>
                </span>
              ) : (
                <span className="relative text-[34px] font-bold leading-tight tracking-tight tabular-nums text-mint">{fmtMin((nextLive?.arrive ?? next.eta!) - 10)}–{fmtMin((nextLive?.arrive ?? next.eta!) + 15)}</span>
              )}
              <span className="relative text-sm text-white/85">
                {next.tripEval?.vehicle.id} · stop {(next.stopIndex ?? 0) + 1} of {next.tripEval?.stops.length} · {STATUS_LABEL[next.status].toLowerCase()}
              </span>
              {nextLive && next.status !== "arrived" && <span className="relative text-xs text-on-ink-muted">{ahead(nextLive, live)}</span>}
            </>
          ) : (
            <span className="relative text-lg font-semibold">{states.some((s) => s.status === "confirmed") ? "Planned tonight after the 16:00 cutoff" : "Nothing else due"}</span>
          )}
        </section>
        <Card className="grid gap-2 p-4">
          <h2 className="flex items-center gap-2 font-bold"><Bell className="size-4" /> Messages</h2>
          {notices.length === 0 && <p className="text-sm text-ink-2">No messages yet.</p>}
          {notices.slice(0, 8).map((n) => (
            <div key={n.id} className="border-t border-line pt-2.5 first:border-0 first:pt-0">
              <p className="text-sm font-semibold">{n.title}</p>
              <p className="text-xs text-ink-2">{n.body}</p>
            </div>
          ))}
        </Card>
      </aside>
    </div>
  );
}

function LateNotice({ n, busy, onAck }: { n: Notice; busy: boolean; onAck: (r: "ok" | "reduce") => void }) {
  return (
    <Card className="grid gap-3 border-warning/60 p-5 ring-2 ring-warning/15">
      <div className="flex flex-wrap items-center gap-2">
        <Timer className="size-5 text-warning" />
        <h2 className="text-lg font-bold">{n.title}</h2>
        <Pill tone="warning" lg className="ml-auto">Needs your reply</Pill>
      </div>
      <p className="rounded-[10px] bg-warning-soft p-3.5 text-[15px]">{n.body}</p>
      <div className="flex flex-wrap gap-2">
        <Button icon={Check} busy={busy} onClick={() => onAck("ok")}>That’s OK</Button>
        <Button kind="secondary" busy={busy} onClick={() => onAck("reduce")}>Reduce the order</Button>
        <a href={CALL.dispatch} className={btnClass("ghost")}><Phone className="size-4" /> Call dispatch</a>
      </div>
    </Card>
  );
}

function DeferralNotice({ n, busy, onAck }: { n: Notice; busy: boolean; onAck: (r: "ok" | "reduce") => void }) {
  return (
    <Card className="grid gap-3 border-danger/50 p-5 ring-2 ring-danger/15">
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle className="size-5 text-danger" />
        <h2 className="text-lg font-bold">{n.title}</h2>
        <Pill tone="danger" lg className="ml-auto">Needs your reply</Pill>
      </div>
      <div className="rounded-[10px] bg-danger-soft p-3.5 text-sm">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-widest text-danger">Why</div>
        {n.body}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button icon={Check} busy={busy} onClick={() => onAck("ok")}>Acknowledge</Button>
        <Button kind="secondary" busy={busy} onClick={() => onAck("reduce")}>Reduce to essentials</Button>
        <a href={CALL.dispatch} className={btnClass("ghost")}><Phone className="size-4" /> Call dispatch</a>
      </div>
    </Card>
  );
}

function OrderCard({ s, live }: { s: OrderState; live?: LiveStop }) {
  const idx = STEPS.findIndex(([st]) => st.includes(s.status));
  const o = s.order;
  const eta = live?.arrive ?? s.eta;
  const showCode = !!o.confirmCode && ["planned", "loading", "on_the_way", "arrived"].includes(s.status);
  return (
    <Card className={cx("grid gap-4 p-5", s.status === "deferred" && "bg-canvas")}>
      <div className="flex flex-wrap items-center gap-2.5">
        <span className={cx("flex size-9 items-center justify-center rounded-lg", o.temp === "chilled" ? "bg-chilled-soft text-chilled" : "bg-subtle text-ink-2")}>
          {o.temp === "chilled" ? <Snowflake className="size-[18px]" /> : <Truck className="size-[18px]" />}
        </span>
        <h2 className="text-[17px] font-bold">{o.temp === "chilled" ? "Chilled" : "Dry"} order {o.id}</h2>
        <span className="text-sm text-ink-2">{o.units} units · {o.volumeM3.toFixed(1)} m³</span>
        <Pill tone={TONE[s.status]} dot lg className="ml-auto">{STATUS_LABEL[s.status]}</Pill>
      </div>
      {s.status === "deferred" ? (
        <p className="text-sm text-ink-2">Moved to the next run: {s.deferral?.note ? `${s.deferral.note} ` : ""}{s.deferral?.reason}</p>
      ) : s.status === "next_run" ? (
        <p className="text-sm text-ink-2">Received after the 16:00 cutoff — it will be planned on the next run.</p>
      ) : (
        <>
          {eta != null && !["delivered", "received", "failed", "arrived"].includes(s.status) && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-primary-soft px-3 py-2 text-sm font-semibold text-primary-strong">
              <Clock className="size-4" />
              {live?.minutesAway != null ? <>Arriving in {away(live.minutesAway)} · around {fmtMin(eta)}</> : <>ETA {fmtMin(eta - 10)}–{fmtMin(eta + 15)}</>}
              <span className="font-medium">· {s.tripEval?.vehicle.id} · you are stop {(s.stopIndex ?? 0) + 1} of {s.tripEval?.stops.length}</span>
              {live && live.lateMin > 0 && <Pill tone="warning">about {Math.ceil(live.lateMin)} min after your window</Pill>}
            </p>
          )}
          {showCode && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-canvas px-4 py-3">
              <KeyRound className="size-5 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-2">Delivery code</p>
                <p className="text-xs text-ink-2">Give it to the driver only once the goods are in front of you.</p>
              </div>
              <span aria-label={`Delivery code ${o.confirmCode!.split("").join(" ")}`} className="font-mono text-[26px] font-bold tracking-[0.3em] tabular-nums">{o.confirmCode!.slice(0, 3)} {o.confirmCode!.slice(3)}</span>
            </div>
          )}
          <ol className="flex">
            {STEPS.map(([, label], i) => {
              const done = i < idx || (i === idx && ["delivered", "received"].includes(s.status));
              const cur = i === idx && !done;
              return (
                <li key={label} className="flex flex-1 flex-col items-center gap-1.5 text-center">
                  <div className="flex w-full items-center">
                    <span className={cx("h-1 flex-1 rounded-r-full", i === 0 ? "bg-transparent" : i <= idx ? "bg-success" : "bg-line")} />
                    <span className={cx("flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-surface", done ? "bg-success text-on-primary" : cur ? (s.status === "failed" ? "bg-danger text-white" : "animate-waypoint bg-primary text-on-primary") : "border-2 border-line-strong bg-surface")}>
                      {done ? <Check className="size-4" strokeWidth={3} /> : cur ? <Truck className="size-4" /> : null}
                    </span>
                    <span className={cx("h-1 flex-1 rounded-l-full", i === STEPS.length - 1 ? "bg-transparent" : i < idx ? "bg-success" : "bg-line")} />
                  </div>
                  <span className={cx("text-[11px] leading-tight sm:text-xs", cur ? "font-bold text-ink" : done ? "font-medium max-sm:sr-only" : "text-muted max-sm:sr-only")}>{label}</span>
                </li>
              );
            })}
          </ol>
        </>
      )}
      {s.status === "delivered" && (
        <Link href={`/store/receipt/${o.id}`} className={cx(btnClass(), "w-fit px-4 py-2.5")}>
          <ClipboardCheck className="size-4" /> Confirm receipt
        </Link>
      )}
    </Card>
  );
}

/** Live stop projections for this store's orders, keyed by order id. */
function liveStops(db: Db, states: OrderState[], now: number): Record<string, LiveStop> {
  const out: Record<string, LiveStop> = {};
  const vehicles = new Set(states.map((s) => s.tripEval?.vehicle.id).filter((v): v is string => !!v));
  for (const vid of vehicles) for (const t of liveRun(vid, vehicleTrips(db, vid), db, now).trips) for (const st of t.stops) out[st.orderId] = st;
  return out;
}

const away = (m: number) => (m <= 1 ? "any minute" : m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, "0")} min`);

/** "2 stops before yours: driving plus about 35 min unloading there." */
function ahead(mine: LiveStop, all: Record<string, LiveStop>) {
  const before = Object.values(all).filter((x) => x.tripId === mine.tripId && x.seq < mine.seq && (x.state === "ahead" || x.state === "here"));
  if (!before.length) return "You are the next stop: the time is the drive to you.";
  const unload = Math.round(before.reduce((n, x) => n + (x.state === "here" ? Math.max(0, x.leave - x.arrive - (x.dwellMin ?? 0)) : x.serviceMin), 0));
  return `${before.length} stop${before.length > 1 ? "s" : ""} before yours: driving plus about ${unload} min unloading there.`;
}
