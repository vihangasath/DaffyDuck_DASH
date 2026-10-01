"use client";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DragStartEvent } from "@dnd-kit/core";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Check, GripVertical, Info, Search, Snowflake, Truck, Upload, Wand2, X, XCircle } from "lucide-react";
import { PageHeader, useDepot } from "@/components/dispatcher-shell";
import { BrandPill, Button, Card, Empty, Kv, Meter, Pill, Seg, Spinner, Stat, StatStrip, cx, type Tone } from "@/components/ui";
import { toast } from "@/components/toast";
import { api } from "@/lib/api";
import { DEMO_DATE, festivalRamp, net, outletName, seed } from "@waypoint/core/reference";
import { fmtDate, fmtMin } from "@waypoint/core/domain/time";
import type { DeferralCode, Order, Plan } from "@waypoint/core/domain/types";
import { useAct, useDepotView } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { moveOrder, planMetrics, suggestFor, type MoveTarget } from "@waypoint/core/planner/allocate";
import { evaluateVehicle, FRESH_BUDGET_MIN, DAY_BUDGET_MIN, type EvalContext, type TripEval } from "@waypoint/core/planner/evaluate";
import { consequence, priority } from "@waypoint/core/planner/priority";

type DropId = `trip:${string}` | `new:${string}` | "defer";
const targetOf = (id: DropId, by: string): MoveTarget =>
  id === "defer" ? { defer: true, by } : id.startsWith("trip:") ? { tripId: id.slice(5) } : { newTripOn: id.slice(4) };

const CODE_LABEL: Record<DeferralCode, string> = {
  REEFER_CAPACITY: "Reefer full", VAN_CAPACITY: "Vans full", FRESH_WINDOW: "Fresh window", DAY_BUDGET: "Day budget",
  MALL_WINDOW: "Mall window", FUEL_QUOTA: "Fuel quota", CAPACITY: "Capacity", OVERSIZE: "Oversize order", NO_VEHICLE: "No vehicle", MANUAL: "Dispatcher",
};
const CODE_TONE: Partial<Record<DeferralCode, Tone>> = { REEFER_CAPACITY: "danger", OVERSIZE: "neutral", MANUAL: "info" };

export default function PlanPage() {
  const { depot } = useDepot();
  const view = useDepotView(depot);
  const [session] = useSession();
  const by = session?.name ?? "Dispatcher";
  const { run, busy } = useAct();
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [hover, setHover] = useState<{ id: DropId; ok: boolean; msg?: string } | null>(null);
  const [filter, setFilter] = useState<"used" | "reefer" | "ambient" | "van" | "all">("used");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const derived = useMemo(() => {
    if (!view?.plan) return null;
    const { plan, orders, ctx } = view;
    const vehicles = seed.vehicles.filter((v) => v.depot === depot && ctx.available.has(v.id));
    const evals = new Map(vehicles.map((v) => [v.id, evaluateVehicle(v.id, plan.trips, ctx)]));
    const tripEval = new Map<string, TripEval>();
    evals.forEach((e) => e.trips.forEach((t) => tripEval.set(t.trip.id, t)));
    const scores = new Map(orders.map((o) => [o.id, priority(o, net, festivalRamp)]));
    return { vehicles, evals, tripEval, scores, metrics: planMetrics(plan, orders, ctx) };
  }, [view, depot]);

  if (!view) return <Spinner />;
  const { plan, orders, ctx, day } = view;

  if (!plan || !derived) {
    return (
      <>
        <PageHeader title="Plan & allocate" sub={`${fmtDate(DEMO_DATE)} · ${depot}`} />
        <Empty icon={CalendarClock} title={day.ordersClosed ? "No plan yet" : "Orders are still open"}>
          <p>Close today’s orders to generate a plan. The auto-plan respects every operating constraint and explains each deferral.</p>
          <Button className="mt-4" icon={Wand2} busy={busy} onClick={() => run(() => api.closeOrdersAndPlan(depot, by), "Auto-plan ready")}>
            Close orders &amp; auto-plan
          </Button>
        </Empty>
      </>
    );
  }
  const { vehicles, evals, tripEval, scores, metrics } = derived;

  const move = (orderId: string, target: MoveTarget, ok?: string) =>
    run(async () => {
      const r = await api.moveOrder(depot, orderId, target, by);
      if (!r.ok) throw new Error(r.violations[0]?.message ?? "That move breaks a constraint.");
      if (r.warnings[0]) toast.error(r.warnings[0]);
      return r;
    }, ok);

  const onDragStart = (e: DragStartEvent) => {
    setDragging(String(e.active.id));
    setSelected(String(e.active.id));
  };
  const onDragOver = (e: DragOverEvent) => {
    const over = e.over?.id as DropId | undefined;
    if (!over) return setHover(null);
    if (over === "defer") return setHover({ id: over, ok: true });
    const r = moveOrder(plan, String(e.active.id), targetOf(over, by), ctx);
    setHover({ id: over, ok: r.ok, msg: r.ok ? r.warnings[0] : r.violations[0]?.message });
  };
  const onDragEnd = (e: DragEndEvent) => {
    const over = e.over?.id as DropId | undefined;
    const id = String(e.active.id);
    setDragging(null);
    setHover(null);
    if (!over) return;
    const inTrip = plan.trips.find((t) => t.orderIds.includes(id));
    if (over === `trip:${inTrip?.id}`) return;
    if (over === "defer" && plan.deferred.some((d) => d.orderId === id)) return;
    void move(id, targetOf(over, by), over === "defer" ? `${id} deferred — reason recorded` : `${id} moved`);
  };

  const shown = vehicles.filter((v) => {
    const used = evals.get(v.id)!.trips.length > 0;
    if (filter === "used") return used;
    if (filter === "reefer") return v.temp === "reefer";
    if (filter === "van") return v.type === "van";
    if (filter === "ambient") return v.temp === "ambient" && v.type === "truck";
    return true;
  });

  const m = metrics;
  const reeferPct = m.reeferPressure * 100;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => (setDragging(null), setHover(null))}>
      <PageHeader
        title="Plan & allocate"
        sub={`${fmtDate(DEMO_DATE)} · ${depot === "Kandy" ? "Kandy hub" : "Peliyagoda DC"} · ${orders.length} orders · ${plan.trips.length} trips`}
        chips={
          <>
            <Pill tone={plan.status === "published" ? "success" : "neutral"} lg>
              Plan v{plan.version} · {plan.status === "published" ? "published" : "draft"}
            </Pill>
            {festivalRamp > 0 && <Pill tone="warning" icon={CalendarClock} lg>Christmas ramp {festivalRamp.toFixed(1)}</Pill>}
          </>
        }
        actions={
          <>
            <Button kind="secondary" icon={Wand2} busy={busy} onClick={() => run(() => api.replan(depot, by), "Auto-plan re-run")} disabled={plan.status === "published"} title={plan.status === "published" ? "Published plans are edited move by move" : undefined}>
              Re-run auto-plan
            </Button>
            <Button icon={Upload} busy={busy} onClick={() => run(() => api.publishPlan(depot, by), "Plan published to loaders, drivers and stores")}>
              {plan.status === "published" ? "Re-publish" : "Publish to loaders"}
            </Button>
          </>
        }
      />

      <div className="px-5 pt-5 lg:px-7">
        <StatStrip className="grid-cols-2 md:grid-cols-5">
          <Metric label="Reefer capacity" value={`${reeferPct.toFixed(0)}%`} sub={`Chilled ${m.chilledDemandM3.toFixed(0)} m³ vs ${m.reeferCapacityM3.toFixed(0)} m³`} pct={reeferPct} limiting={m.bindingConstraint === "reefer"} />
          <Metric label="Fresh window (reefers)" value={`${Math.round(m.freshMinutesAvg)}/${m.freshBudget}`} unit="min" sub="avg per refrigerated vehicle" pct={(m.freshMinutesAvg / m.freshBudget) * 100} limiting={m.bindingConstraint === "fresh-window"} />
          <Metric label="Dry-box volume" value={`${(m.dryUtil * 100).toFixed(0)}%`} sub="of capacity on planned trips" pct={m.dryUtil * 100} />
          <Metric label="Van-only stops" value={`${m.vanOnlyServed}/${m.vanOnlyTotal}`} unit="served" sub="vans reserved for them first" pct={m.vanOnlyTotal ? (m.vanOnlyServed / m.vanOnlyTotal) * 100 : 100} tone={m.vanOnlyServed === m.vanOnlyTotal ? "success" : "danger"} limiting={m.bindingConstraint === "vans"} />
          <Metric className="col-span-2 md:col-span-1" label="Fuel quota (week)" value={`${(m.fuelWeekPct * 100).toFixed(0)}%`} unit="used" sub={m.worstFuel ? `${m.worstFuel.vehicleId} at ${(m.worstFuel.pct * 100).toFixed(0)}%` : ""} pct={m.fuelWeekPct * 100} />
        </StatStrip>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[280px_minmax(0,1fr)] lg:p-7 2xl:grid-cols-[300px_minmax(0,1fr)_340px]">
        <Queue plan={plan} orders={orders} scores={scores} selected={selected} onSelect={setSelected} dragging={!!dragging} served={m.served} />

        <section aria-label="Vehicle lanes" className="grid content-start gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold">Fleet · {vehicles.length} available</h2>
            <span className="text-xs text-muted">{seed.vehicles.filter((v) => v.depot === depot).length - vehicles.length} in workshop</span>
            <div className="ml-auto">
              <Seg
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "used", label: `In plan ${[...evals.values()].filter((e) => e.trips.length).length}` },
                  { value: "reefer", label: "Reefer" },
                  { value: "ambient", label: "Dry-box" },
                  { value: "van", label: "Van" },
                  { value: "all", label: "All" },
                ]}
              />
            </div>
          </div>
          {shown.map((v) => (
            <VehicleLane key={v.id} ev={evals.get(v.id)!} tripEval={tripEval} ctx={ctx} selected={selected} onSelect={setSelected} hover={hover} dragging={!!dragging} />
          ))}
        </section>

        <div className={cx(selected ? "fixed inset-y-0 right-0 z-30 w-[min(380px,100vw)] overflow-y-auto bg-canvas p-3 shadow-2xl 2xl:static 2xl:w-auto 2xl:overflow-visible 2xl:bg-transparent 2xl:p-0 2xl:shadow-none" : "hidden 2xl:block")}>
          {selected ? (
            <Detail key={selected} orderId={selected} plan={plan} ctx={ctx} score={scores.get(selected)!} tripEval={tripEval} onClose={() => setSelected(null)} move={move} busy={busy} by={by} />
          ) : (
            <Card className="grid gap-2.5 p-5 text-sm leading-relaxed text-ink-2">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><GripVertical className="size-5" /></span>
              <h2 className="text-base font-bold text-ink">How to adjust the plan</h2>
              <p>Select an order to see its priority score, why it was deferred and a suggested fix.</p>
              <p>Drag any order onto a trip, onto an empty trip slot, or onto <b>Defer</b>. Every drop is checked against capacity, refrigeration, van access, home depot, windows, time budgets and fuel before it lands.</p>
              <p className="flex items-center gap-2 text-xs text-muted"><Info className="size-4" /> Keyboard users: use the Move and Defer controls in the order panel.</p>
            </Card>
          )}
        </div>
      </div>

      <DragOverlay>
        {dragging ? (
          <div className="rounded-xl border-2 border-primary bg-surface px-3 py-2 text-sm font-semibold shadow-float">
            {dragging} · {outletName(ctx.orders.get(dragging)!.outletId)}
            {hover && <div className={cx("mt-1 max-w-64 text-xs font-medium", hover.ok ? "text-success" : "text-danger")}>{hover.ok ? hover.msg ?? "OK to drop" : hover.msg}</div>}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Metric({ label, value, unit, sub, pct, limiting, tone, className }: { label: string; value: string; unit?: string; sub: string; pct: number; limiting?: boolean; tone?: Tone; className?: string }) {
  return (
    <Stat
      className={className}
      label={label}
      tone={limiting ? "danger" : undefined}
      flag={limiting && <Pill tone="danger" solid>Limiting</Pill>}
      value={<>{value}{unit && <span className="ml-1 text-sm font-semibold tracking-normal text-ink-2">{unit}</span>}</>}
      meter={{ pct, tone: tone ?? (limiting ? "danger" : pct > 90 ? "warning" : "primary") }}
      sub={sub}
    />
  );
}

function Queue({ plan, orders, scores, selected, onSelect, dragging, served }: { plan: Plan; orders: Order[]; scores: Map<string, ReturnType<typeof priority>>; selected: string | null; onSelect: (id: string) => void; dragging: boolean; served: number }) {
  const [tab, setTab] = useState<"deferred" | "all">("deferred");
  const [q, setQ] = useState("");
  const { setNodeRef, isOver } = useDroppable({ id: "defer" });
  const deferredIds = new Set(plan.deferred.map((d) => d.orderId));
  const base = tab === "deferred" ? orders.filter((o) => deferredIds.has(o.id)) : orders;
  const list = base
    .filter((o) => !q || `${o.id} ${o.outletId} ${outletName(o.outletId)} ${net.outlets.get(o.outletId)!.district}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => scores.get(b.id)!.total - scores.get(a.id)!.total);
  return (
    <Card className="flex max-h-[calc(100dvh-120px)] flex-col overflow-hidden lg:sticky lg:top-4">
      <div className="grid gap-2.5 p-3">
        <h2 className="font-bold">Order queue</h2>
        <Seg fill value={tab} onChange={setTab} options={[{ value: "deferred", label: `Deferred ${plan.deferred.length}` }, { value: "all", label: `All ${orders.length}` }]} />
        <label className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-2">
          <Search className="size-3.5 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter outlet, district, order" className="w-full bg-transparent text-xs outline-none" aria-label="Filter orders" />
        </label>
      </div>
      <div
        ref={setNodeRef}
        className={cx(
          "mx-3 mb-2 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed py-2.5 text-xs font-semibold transition",
          dragging ? (isOver ? "border-danger bg-danger-soft text-danger" : "border-line-strong text-ink-2") : "hidden",
        )}
      >
        <XCircle className="size-4" /> Drop here to defer
      </div>
      <div className="grid gap-1.5 overflow-y-auto border-t border-line p-2">
        {list.length === 0 && <p className="p-4 text-center text-sm text-ink-2">{tab === "deferred" ? `Nothing deferred — all ${served} orders are served.` : "No matching orders."}</p>}
        {list.map((o) => (
          <QueueCard key={o.id} order={o} score={scores.get(o.id)!.total} deferral={plan.deferred.find((d) => d.orderId === o.id)} selected={selected === o.id} onSelect={onSelect} />
        ))}
      </div>
    </Card>
  );
}

function QueueCard({ order: o, score, deferral, selected, onSelect }: { order: Order; score: number; deferral?: Plan["deferred"][number]; selected: boolean; onSelect: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: o.id });
  const out = net.outlets.get(o.outletId)!;
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onSelect(o.id)}
      className={cx("grid cursor-grab gap-1.5 rounded-[10px] border p-2.5 text-left transition-[border-color,box-shadow,background-color] duration-150 active:cursor-grabbing", selected ? "border-primary bg-primary-soft ring-2 ring-primary/25" : "border-line bg-surface hover:border-line-strong hover:shadow-card", isDragging && "opacity-40")}
    >
      <div className="flex items-center gap-1.5">
        <GripVertical className="size-3.5 text-muted" />
        <span className="text-[13px] font-bold">{o.id}</span>
        <span className="truncate text-[13px] text-ink-2">{outletName(o.outletId)}</span>
        <Pill tone={score > 60 ? "danger" : score > 40 ? "warning" : "neutral"} solid={score > 60} className="ml-auto">P {score}</Pill>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <BrandPill brand={o.brand} />
        {o.temp === "chilled" && <Pill tone="chilled" icon={Snowflake}>Chilled</Pill>}
        {out.parking === "van_only" && <Pill tone="warning">Van-only</Pill>}
        <span className="text-[11px] text-muted">{out.district} · {o.volumeM3.toFixed(1)} m³</span>
      </div>
      {(deferral || o.deferredYesterday) && (
        <div className="flex flex-wrap gap-1">
          {deferral && <Pill tone={CODE_TONE[deferral.code] ?? "warning"} dot>{CODE_LABEL[deferral.code]}</Pill>}
          {o.deferredYesterday && <Pill tone="danger" icon={AlertTriangle}>Skipped yesterday</Pill>}
        </div>
      )}
    </div>
  );
}

function VehicleLane({ ev, tripEval, ctx, selected, onSelect, hover, dragging }: { ev: ReturnType<typeof evaluateVehicle>; tripEval: Map<string, TripEval>; ctx: EvalContext; selected: string | null; onSelect: (id: string) => void; hover: { id: DropId; ok: boolean; msg?: string } | null; dragging: boolean }) {
  const v = ev.vehicle;
  const fresh = ev.trips.some((t) => t.trip.brand === "Fresh");
  const minutes = fresh ? ev.freshMinutes : ev.dayMinutes;
  const budget = fresh ? FRESH_BUDGET_MIN : DAY_BUDGET_MIN;
  const fuelPct = (ev.fuelWeekL / v.weeklyFuelQuotaL) * 100;
  const slots = [...ev.trips.map((t) => t.trip.id), ...(ev.trips.length < 2 ? [null] : [])];
  return (
    <Card className="grid gap-2.5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cx("flex size-8 items-center justify-center rounded-lg", v.temp === "reefer" ? "bg-chilled-soft text-chilled" : "bg-subtle text-ink-2")}>
          {v.temp === "reefer" ? <Snowflake className="size-4" /> : <Truck className="size-4" />}
        </span>
        <span className="text-[15px] font-bold tracking-tight">{v.id}</span>
        <Pill tone={v.temp === "reefer" ? "chilled" : "neutral"}>
          {v.temp === "reefer" ? "Reefer" : "Dry-box"} {v.type}
        </Pill>
        <span className="text-[11px] text-muted">{v.volumeCapM3} m³ · {v.weightCapKg.toLocaleString()} kg</span>
        <span className="ml-auto flex flex-wrap items-center gap-3 text-[11px] font-semibold text-ink-2">
          {ev.trips.length > 0 && <span className={cx(minutes / budget > 0.9 && "text-warning")}>{fresh ? "Fresh" : "Style/Tech"} {minutes}/{budget} min</span>}
          <span className={cx(fuelPct > 90 && "text-warning")}>Fuel {fuelPct.toFixed(0)}%</span>
        </span>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {slots.map((id, i) =>
          id ? (
            <TripBox key={id} te={tripEval.get(id)!} ctx={ctx} selected={selected} onSelect={onSelect} hover={hover} />
          ) : (
            <NewSlot key={`new-${i}`} vehicleId={v.id} n={ev.trips.length + 1} hover={hover} dragging={dragging} />
          ),
        )}
      </div>
    </Card>
  );
}

function TripBox({ te, ctx, selected, onSelect, hover }: { te: TripEval; ctx: EvalContext; selected: string | null; onSelect: (id: string) => void; hover: { id: DropId; ok: boolean; msg?: string } | null }) {
  const dropId: DropId = `trip:${te.trip.id}`;
  const { setNodeRef } = useDroppable({ id: dropId });
  const h = hover?.id === dropId ? hover : null;
  const vol = (te.volumeM3 / te.vehicle.volumeCapM3) * 100;
  const wt = (te.weightKg / te.vehicle.weightCapKg) * 100;
  return (
    <div ref={setNodeRef} className={cx("grid content-start gap-2 rounded-[10px] border p-2.5", h ? (h.ok ? "border-2 border-success bg-success-soft" : "border-2 border-dashed border-danger bg-danger-soft") : "border-line bg-canvas")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-bold">Trip {te.trip.tripNo}</span>
        <BrandPill brand={te.trip.brand} />
        <span className="text-xs font-medium text-ink-2">{te.trip.district}</span>
        <span className="ml-auto text-[11px] font-semibold text-ink-2">
          {fmtMin(te.depart)}–{fmtMin(te.returnAt)} · {te.minutes} min
        </span>
      </div>
      {h && !h.ok && <p className="flex items-start gap-1.5 text-[11px] font-semibold text-danger"><X className="mt-px size-3.5 shrink-0" />{h.msg}</p>}
      <div className="flex flex-wrap gap-1">
        {te.stops.map((s) => (
          <StopChip key={s.orderId} orderId={s.orderId} late={s.late} eta={fmtMin(s.arrive)} chilled={ctx.orders.get(s.orderId)!.temp === "chilled"} selected={selected === s.orderId} onSelect={onSelect} />
        ))}
      </div>
      {[["Vol", vol], ["Wt", wt]].map(([l, p]) => (
        <div key={l as string} className="flex items-center gap-2 text-[10px] font-semibold text-muted">
          <span className="w-5">{l}</span>
          <Meter pct={p as number} className="h-[5px]" />
          <span className={cx("w-9 text-right tabular-nums", (p as number) > 99 ? "text-danger" : "text-ink-2")}>{(p as number).toFixed(0)}%</span>
        </div>
      ))}
      {te.disruptionIndex < 95 && <p className="text-[11px] font-medium text-ink-2">Road disruption {te.disruptionIndex}/100 · travel ×{(100 / te.disruptionIndex).toFixed(2)}</p>}
      {te.warnings.length > 0 && <p className="text-[11px] font-medium text-warning">{te.warnings.length} stop{te.warnings.length > 1 ? "s" : ""} after window close</p>}
    </div>
  );
}

function StopChip({ orderId, late, eta, chilled, selected, onSelect }: { orderId: string; late: boolean; eta: string; chilled: boolean; selected: boolean; onSelect: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: orderId });
  const o = orderId;
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onSelect(o)}
      title={`${o} · ETA ${eta}`}
      className={cx("inline-flex cursor-grab items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold", selected ? "border-primary bg-primary text-on-primary" : late ? "border-warning bg-warning-soft text-warning" : "border-line bg-surface text-ink-2", isDragging && "opacity-30")}
    >
      {chilled && <Snowflake className="size-2.5" />}
      {o} <span className="font-medium opacity-70">{eta}</span>
    </button>
  );
}

function NewSlot({ vehicleId, n, hover, dragging }: { vehicleId: string; n: number; hover: { id: DropId; ok: boolean; msg?: string } | null; dragging: boolean }) {
  const dropId: DropId = `new:${vehicleId}`;
  const { setNodeRef } = useDroppable({ id: dropId });
  const h = hover?.id === dropId ? hover : null;
  return (
    <div ref={setNodeRef} className={cx("grid content-center gap-1 rounded-[10px] border border-dashed p-3 text-xs", h ? (h.ok ? "border-2 border-success bg-success-soft" : "border-2 border-danger bg-danger-soft") : dragging ? "border-primary bg-primary-soft" : "border-line-strong bg-canvas")}>
      <span className="font-semibold text-ink-2">Trip {n} · empty</span>
      <span className={cx(h && !h.ok ? "font-semibold text-danger" : "text-muted")}>{h ? (h.ok ? "Drop to start a new trip" : h.msg) : "Drag an order here to add a trip"}</span>
    </div>
  );
}

const REASONS: { code: DeferralCode; label: string }[] = [
  { code: "REEFER_CAPACITY", label: "Refrigerated capacity" },
  { code: "CAPACITY", label: "Vehicle capacity" },
  { code: "FRESH_WINDOW", label: "Fresh window / time" },
  { code: "MALL_WINDOW", label: "Mall access window" },
  { code: "FUEL_QUOTA", label: "Fuel quota" },
  { code: "MANUAL", label: "Other (explain)" },
];

function Detail({ orderId, plan, ctx, score, tripEval, onClose, move, busy, by }: { orderId: string; plan: Plan; ctx: EvalContext; score: ReturnType<typeof priority>; tripEval: Map<string, TripEval>; onClose: () => void; move: (id: string, t: MoveTarget, ok?: string) => Promise<unknown>; busy: boolean; by: string }) {
  const o = ctx.orders.get(orderId)!;
  const out = net.outlets.get(o.outletId)!;
  const deferral = plan.deferred.find((d) => d.orderId === orderId);
  const trip = plan.trips.find((t) => t.orderIds.includes(orderId));
  const te = trip ? tripEval.get(trip.id) : undefined;
  const stop = te?.stops.find((s) => s.orderId === orderId);
  const suggestion = deferral && deferral.code !== "OVERSIZE" ? suggestFor(plan, orderId, ctx, festivalRamp) : null;
  const [reason, setReason] = useState<DeferralCode>(o.temp === "chilled" ? "REEFER_CAPACITY" : "CAPACITY");
  const [note, setNote] = useState("");

  const options = (() => {
    const res: { label: string; target: MoveTarget }[] = [];
    for (const t of plan.trips) {
      if (t.id === trip?.id || t.brand !== o.brand || t.district !== out.district) continue;
      if (moveOrder(plan, orderId, { tripId: t.id }, ctx).ok) res.push({ label: `${t.vehicleId} · Trip ${t.tripNo}`, target: { tripId: t.id } });
    }
    for (const v of seed.vehicles) {
      if (v.depot !== plan.depot || plan.trips.filter((t) => t.vehicleId === v.id).length >= 2) continue;
      if (moveOrder(plan, orderId, { newTripOn: v.id }, ctx).ok) res.push({ label: `${v.id} · new trip`, target: { newTripOn: v.id } });
      if (res.length > 8) break;
    }
    return res;
  })();

  const applySuggestion = async () => {
    if (!suggestion) return;
    if (suggestion.kind === "swap") await move(suggestion.removeOrderId!, { defer: true, code: "MANUAL", note: `Swapped out for ${orderId} (higher priority)`, by });
    await move(orderId, suggestion.kind === "newTrip" ? { newTripOn: suggestion.vehicleId } : { tripId: suggestion.tripId }, `${orderId} served on ${suggestion.vehicleId}`);
  };

  return (
    <Card className="grid gap-0 overflow-hidden 2xl:sticky 2xl:top-4">
      <div className="grid gap-2 p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold">{o.id}</h2>
          <span className="truncate text-sm font-medium text-ink-2">{o.outletId} · {outletName(o.outletId)}</span>
          <button onClick={onClose} aria-label="Close" className="ml-auto rounded p-1 text-muted hover:text-ink"><X className="size-4" /></button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <BrandPill brand={o.brand} />
          {o.temp === "chilled" ? <Pill tone="chilled" icon={Snowflake}>Chilled</Pill> : <Pill>Dry</Pill>}
          {out.parking === "van_only" && <Pill tone="warning">Van-only</Pill>}
          {o.deferredYesterday && <Pill tone="danger" icon={AlertTriangle}>Skipped yesterday</Pill>}
        </div>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <Kv k="Window" v={out.mallWindow ? `Mall ${out.mallWindow}` : `${out.windowOpen}–${out.windowClose}`} />
          <Kv k="Dock" v={out.dockType.replace("_", " ")} />
          <Kv k="Size" v={`${o.volumeM3.toFixed(2)} m³ · ${Math.round(o.weightKg)} kg`} />
          <Kv k="Last served" v={`${o.daysSinceLastServed} day${o.daysSinceLastServed === 1 ? "" : "s"} ago`} />
        </div>
      </div>
      <div className="grid gap-1.5 border-t border-line p-4">
        <div className="flex items-center">
          <span className="text-sm font-bold">Priority score</span>
          <span className={cx("ml-auto text-[28px] font-bold leading-none tracking-tight tabular-nums", score.total > 60 ? "text-danger" : "text-ink")}>{score.total}</span>
        </div>
        {score.parts.map((p) => (
          <div key={p.label} className="flex items-center gap-2 text-xs text-ink-2">
            <span className="flex-1">{p.label}</span>
            <span className="w-14"><Meter pct={p.points * 3} tone="danger" className="h-1" /></span>
            <span className="w-7 text-right font-semibold text-ink">+{p.points}</span>
          </div>
        ))}
      </div>
      <div className="grid gap-3 border-t border-line p-4">
        {trip && te && stop ? (
          <div className="rounded-[10px] bg-success-soft p-3 text-sm">
            <div className="font-bold text-success">Served on {trip.vehicleId} · Trip {trip.tripNo}</div>
            <div className="text-ink">Stop {stop.seq + 1} of {te.stops.length} · ETA {fmtMin(stop.arrive)}{stop.late ? " (after window)" : ""} · departs {fmtMin(te.depart)}</div>
          </div>
        ) : deferral ? (
          <div className="grid gap-1 rounded-[10px] bg-danger-soft p-3 text-sm">
            <div className="text-xs font-bold uppercase tracking-wide text-danger">Why it’s deferred · {deferral.decidedBy}</div>
            <p>{deferral.note ? `${deferral.note} ` : ""}{deferral.reason}</p>
          </div>
        ) : null}
        {deferral && (
          <p className="flex gap-2 text-xs text-ink-2"><Info className="mt-0.5 size-3.5 shrink-0 text-warning" /> If deferred: {consequence(o)}.</p>
        )}
        {suggestion && (
          <div className="grid gap-2 rounded-[10px] bg-primary-soft p-3 text-sm">
            <div className="text-xs font-bold uppercase tracking-wide text-primary-strong">Suggested fix</div>
            <p>
              {suggestion.kind === "insert" && `Room on ${suggestion.vehicleId} (existing ${o.brand} · ${out.district} trip).`}
              {suggestion.kind === "newTrip" && `${suggestion.vehicleId} has a free trip slot that can reach ${out.district} in time.`}
              {suggestion.kind === "swap" && `Swap with ${suggestion.removeOrderId} (${outletName(ctx.orders.get(suggestion.removeOrderId!)!.outletId)}, ${suggestion.gain} points lower priority) on ${suggestion.vehicleId}.`}
            </p>
            <Button icon={Check} busy={busy} onClick={applySuggestion}>Apply</Button>
          </div>
        )}
        {deferral && !suggestion && deferral.code !== "OVERSIZE" && <p className="text-xs text-muted">No feasible swap: every vehicle that could carry this order is full or out of time.</p>}
      </div>
      <div className="grid gap-2 border-t border-line p-4">
        {options.length > 0 && (
          <label className="grid gap-1 text-xs font-semibold text-ink-2">
            {trip ? "Move to" : "Serve on"}
            <select className="rounded-lg border border-line-strong bg-surface px-2 py-2 text-sm text-ink" defaultValue="" onChange={(e) => { const opt = options[Number(e.target.value)]; if (opt) void move(orderId, opt.target, `${orderId} → ${opt.label}`); }}>
              <option value="" disabled>Choose a feasible trip…</option>
              {options.map((opt, i) => <option key={opt.label} value={i}>{opt.label}</option>)}
            </select>
          </label>
        )}
        {trip && (
          <div className="grid gap-2 rounded-[10px] border border-line p-3">
            <span className="text-xs font-semibold text-ink-2">Defer with a reason (the store is told)</span>
            <select value={reason} onChange={(e) => setReason(e.target.value as DeferralCode)} className="rounded-lg border border-line-strong bg-surface px-2 py-2 text-sm">
              {REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the store (optional)" className="rounded-lg border border-line-strong px-2 py-2 text-sm" />
            <Button kind="secondary" busy={busy} onClick={() => move(orderId, { defer: true, code: reason, note: note || undefined, by }, `${orderId} deferred`)}>Defer order</Button>
          </div>
        )}
        <Link href={`/dispatcher/deferrals?outlet=${o.outletId}`} className="text-xs font-semibold text-primary">Outlet service history →</Link>
      </div>
    </Card>
  );
}

