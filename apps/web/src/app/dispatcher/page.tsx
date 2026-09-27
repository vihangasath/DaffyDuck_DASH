"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Clock, Snowflake, Truck, Activity, Wand2, ArrowRight } from "lucide-react";
import { PageHeader, useDepot } from "@/components/dispatcher-shell";
import { BrandPill, Button, Card, DOT, IconBubble, Pill, Seg, Spinner, Stat, StatStrip, brandTone, btnClass, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { DEMO_DATE, demoDay, net, outletName, seed } from "@waypoint/core/reference";
import { fmtDate } from "@waypoint/core/domain/time";
import { useAct, useDepotView } from "@/lib/hooks";
import { useSession } from "@/lib/session";

export default function Today() {
  const { depot } = useDepot();
  const view = useDepotView(depot);
  const [session] = useSession();
  const { run, busy } = useAct();
  const router = useRouter();
  const [brand, setBrand] = useState<"All" | "Fresh" | "Style" | "Tech">("All");
  const [showAll, setShowAll] = useState(false);

  const stats = useMemo(() => {
    if (!view) return null;
    const { orders, db } = view;
    const vol = (xs: typeof orders) => xs.reduce((s, o) => s + o.volumeM3, 0);
    const avail = seed.vehicles.filter((v) => v.depot === depot && db.fleetStatus[v.id] === "available");
    const chilled = orders.filter((o) => o.temp === "chilled");
    return {
      fresh: orders.filter((o) => o.brand === "Fresh"),
      chilled,
      style: orders.filter((o) => o.brand === "Style"),
      tech: orders.filter((o) => o.brand === "Tech"),
      late: db.orders.filter((o) => o.depot === depot && o.forDate === "next-run"),
      chilledVol: vol(chilled),
      reeferCap: avail.filter((v) => v.temp === "reefer").reduce((s, v) => s + v.volumeCapM3 * 2, 0),
      dryVol: vol(orders.filter((o) => o.temp === "ambient")),
      dryCap: avail.filter((v) => v.temp === "ambient").reduce((s, v) => s + v.volumeCapM3 * 2, 0),
      workshop: seed.vehicles.filter((v) => v.depot === depot && db.fleetStatus[v.id] !== "available"),
      skipped: [...new Set(orders.filter((o) => o.deferredYesterday).map((o) => o.outletId))],
      vol,
    };
  }, [view, depot]);

  if (!view || !stats) return <Spinner />;
  const { day, orders } = view;
  const disrupted = seed.roadConditions.filter((r) => r.disruptionIndex < 85 && seed.districtTravel.find((d) => d.district === r.district)?.depot === depot);
  const nextFestival = seed.calendar.find((c) => c.date > DEMO_DATE && c.festival);
  const list = orders.filter((o) => brand === "All" || o.brand === brand);

  const close = async () => {
    const plan = await run(() => api.closeOrdersAndPlan(depot, session?.name ?? "Dispatcher"), "Orders closed. Auto-plan ready to review.");
    if (plan) router.push("/dispatcher/plan");
  };

  return (
    <>
      <PageHeader
        title="Today"
        sub={`Planning deliveries for ${fmtDate(DEMO_DATE)} · ${depot === "Kandy" ? "Kandy hub" : "Peliyagoda DC"}`}
        chips={day.ordersClosed ? <Pill tone="neutral" icon={Clock} lg>Orders closed · {day.closedBy}</Pill> : <Pill tone="warning" icon={Clock} lg>Orders open · cutoff 16:00</Pill>}
        actions={
          day.ordersClosed ? (
            <Link href="/dispatcher/plan" className={btnClass()}>
              Open plan <ArrowRight className="size-4" />
            </Link>
          ) : (
            <Button icon={Wand2} busy={busy} onClick={close}>
              Close orders &amp; auto-plan
            </Button>
          )
        }
      />
      <div className="grid gap-4 p-5 lg:p-7">
        <StatStrip className="grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr_1fr_1fr]">
          <Stat className="col-span-2 md:col-span-1" label="Orders confirmed" dot="primary" value={orders.length} sub={`${stats.vol(orders).toFixed(0)} m³ to move · share of volume by brand`}>
            <BrandMix parts={[{ b: "Fresh", v: stats.vol(stats.fresh) }, { b: "Style", v: stats.vol(stats.style) }, { b: "Tech", v: stats.vol(stats.tech) }]} />
          </Stat>
          <Stat label="Fresh" dot="fresh" value={stats.fresh.length} sub={`${stats.chilled.length} chilled · ${stats.fresh.length - stats.chilled.length} dry`} />
          <Stat label="Style" dot="style" value={stats.style.length} sub={`${stats.vol(stats.style).toFixed(0)} m³ · volume-bound`} />
          <Stat label="Tech" dot="tech" value={stats.tech.length} sub={`${Math.round(stats.tech.reduce((s, o) => s + o.weightKg, 0))} kg · fragile`} />
          <Stat label="After cutoff" dot="warning" value={stats.late.length} sub="Roll to the next run" />
        </StatStrip>

        <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 px-4 py-3.5">
              <h2 className="font-bold">Confirmed orders</h2>
              <Pill tone="success" dot>{day.ordersClosed ? "Closed" : "Live"}</Pill>
              <div className="ml-auto">
                <Seg value={brand} onChange={setBrand} options={(["All", "Fresh", "Style", "Tech"] as const).map((v) => ({ value: v, label: v }))} />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-2">Order</th>
                    <th className="px-2 py-2">Outlet</th>
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2 text-right">Size</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(showAll ? list : list.slice(0, 10)).map((o) => {
                    const out = net.outlets.get(o.outletId)!;
                    return (
                      <tr key={o.id} className="border-t border-line transition-colors hover:bg-canvas">
                        <td className="px-4 py-2.5 font-semibold">{o.id}</td>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-2">
                            <BrandPill brand={o.brand} />
                            <span className="text-ink-2">{o.outletId} · {outletName(o.outletId)}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {o.temp === "chilled" ? <Pill tone="chilled" icon={Snowflake}>Chilled</Pill> : <Pill>Dry</Pill>}
                            {out.parking === "van_only" && <Pill tone="warning" icon={Truck}>Van-only</Pill>}
                            {out.mallWindow && <Pill tone="style">Mall {out.mallWindow}</Pill>}
                            {o.deferredYesterday && <Pill tone="danger" icon={AlertTriangle}>Skipped yesterday</Pill>}
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-ink-2">
                          {o.volumeM3.toFixed(1)} m³ · {Math.round(o.weightKg)} kg
                        </td>
                        <td className="px-4 py-2.5">
                          <Pill tone="success">{o.source === "Store app" ? "Confirmed · app" : "Confirmed"}</Pill>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {list.length > 10 && (
              <button className="w-full border-t border-line py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary-soft" onClick={() => setShowAll((s) => !s)}>
                {showAll ? "Show fewer" : `Show all ${list.length} orders`}
              </button>
            )}
          </Card>

          <div className="grid content-start gap-4">
            <Card className="grid gap-4 p-4">
              <h2 className="font-bold">Demand vs capacity</h2>
              {[
                { l: "Chilled → refrigerated", a: stats.chilledVol, b: stats.reeferCap, icon: Snowflake },
                { l: "Dry → dry-box & vans", a: stats.dryVol, b: stats.dryCap, icon: Truck },
              ].map((r) => {
                const pct = (r.a / r.b) * 100;
                const over = r.a - r.b;
                return (
                  <div key={r.l} className="grid gap-2">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="flex items-center gap-1.5 font-semibold"><r.icon className="size-4 text-ink-2" />{r.l}</span>
                      <span className={cx("text-lg font-bold tabular-nums tracking-tight", pct > 100 ? "text-danger" : "text-ink")}>{pct.toFixed(0)}%</span>
                    </div>
                    <CapacityBar pct={pct} />
                    <div className="flex justify-between text-xs tabular-nums text-ink-2">
                      <span>{r.a.toFixed(0)} m³ demand</span>
                      <span className={cx(over > 0 && "font-semibold text-danger")}>{over > 0 ? `${over.toFixed(0)} m³ over capacity` : `${r.b.toFixed(0)} m³ capacity`}</span>
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-muted">Capacity = available vehicles × 2 trips. Time budgets usually bind before volume on far districts.</p>
            </Card>
            <Card className="grid gap-3 p-4">
              <h2 className="font-bold">Watch list for tomorrow</h2>
              <Watch icon={AlertTriangle} tone="danger" title={`${stats.skipped.length} outlets skipped yesterday`} sub={stats.skipped.slice(0, 4).map((id) => `${id} ${outletName(id)}`).join(" · ") || "None"} />
              <Watch icon={Truck} tone="warning" title={`${stats.workshop.length} vehicles in the workshop`} sub={stats.workshop.map((v) => `${v.id}${v.temp === "reefer" ? " (reefer)" : ""}`).join(" · ") || "Full fleet available"} />
              <Watch
                icon={Activity}
                tone="info"
                title={disrupted.length ? `${disrupted.length} districts with road disruption` : "Roads clear"}
                sub={disrupted.map((d) => `${d.district} ${d.disruptionIndex}/100`).join(" · ") || "No disruption reported for the plan date"}
              />
              <Watch
                icon={CalendarClock}
                tone="warning"
                title={nextFestival ? `${cap(nextFestival.festival!.replace("_", " "))} on ${fmtDate(nextFestival.date, { day: "numeric", month: "short" })}` : "No festival soon"}
                sub={`Festival ramp ${demoDay.festivalRamp.toFixed(1)} · ${demoDay.payday ? "payday" : "not a payday"} · ${demoDay.monsoon ? "monsoon" : "no monsoon"}`}
              />
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

function Watch({ icon, tone, title, sub }: { icon: Parameters<typeof IconBubble>[0]["icon"]; tone: "danger" | "warning" | "info"; title: string; sub: string }) {
  return (
    <div className="flex gap-3">
      <IconBubble icon={icon} tone={tone} />
      <div className="min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-ink-2">{sub}</div>
      </div>
    </div>
  );
}

/** Proportional strip of the day's volume by brand: Fresh dominates the demo day, and this shows it at a glance. */
function BrandMix({ parts }: { parts: { b: string; v: number }[] }) {
  const total = parts.reduce((s, p) => s + p.v, 0) || 1;
  return (
    <div className="mt-2 grid gap-1.5">
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.b} ${Math.round((p.v / total) * 100)}%`).join(", ")}>
        {parts.map((p) => (
          <span key={p.b} className={cx("h-full first:rounded-l-full last:rounded-r-full", DOT[brandTone(p.b)])} style={{ width: `${(p.v / total) * 100}%`, minWidth: p.v ? 4 : 0 }} />
        ))}
      </div>
      <div className="flex gap-3 text-[11px] font-semibold text-ink-2">
        {parts.map((p) => (
          <span key={p.b} className="tabular-nums">{p.b} {Math.round((p.v / total) * 100)}%</span>
        ))}
      </div>
    </div>
  );
}

/** Demand against capacity with the 100% line drawn, so "over" reads as crossing a line rather than a full bar. */
function CapacityBar({ pct }: { pct: number }) {
  const scale = Math.max(100, pct) * 1.08;
  const fill = pct > 100 ? "bg-danger" : pct > 90 ? "bg-warning" : "bg-primary";
  return (
    <div className="relative h-3 rounded-full bg-subtle" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx("h-full rounded-full transition-[width] duration-700 ease-out", fill)} style={{ width: `${(pct / scale) * 100}%` }} />
      <span className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-ink" style={{ left: `${(100 / scale) * 100}%` }} title="Capacity" />
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
