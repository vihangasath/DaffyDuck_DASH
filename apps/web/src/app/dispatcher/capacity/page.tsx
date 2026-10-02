"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Info } from "lucide-react";
import { PageHeader, useDepot } from "@/components/dispatcher-shell";
import { Card, IconBubble, Pill, Seg, Spinner, Stat, StatStrip } from "@/components/ui";
import { DEMO_DATE, seed } from "@waypoint/core/reference";
import { useDepotView } from "@/lib/hooks";

// Practical weekly capacity = vehicle volume × trips per day × operating days × realistic fill.
// Trips/day and fill are planning assumptions (documented), tuned from the route history.
const TRIPS_PER_DAY = 1.3;
const FILL = 0.7;
const BRAND_COLOR = { Fresh: "var(--color-fresh)", Style: "var(--color-style)", Tech: "var(--color-tech)" } as const;

export default function Capacity() {
  const { depot } = useDepot();
  const view = useDepotView(depot);
  const [fleet, setFleet] = useState<"today" | "full">("today");

  const data = useMemo(() => {
    if (!view) return null;
    const weeks = [...seed.meta.pastWeeks.slice(-6), ...seed.meta.futureWeeks.map((w) => w.week)];
    const meta = new Map(seed.meta.futureWeeks.map((w) => [w.week, w]));
    const vs = seed.vehicles.filter((v) => v.depot === depot && (fleet === "full" || view.db.fleetStatus[v.id] === "available"));
    const reeferCap = vs.filter((v) => v.temp === "reefer").reduce((s, v) => s + v.volumeCapM3, 0);
    const allCap = vs.reduce((s, v) => s + v.volumeCapM3, 0);
    const avgReefer = reeferCap / Math.max(1, vs.filter((v) => v.temp === "reefer").length);
    const cols = weeks.map((w) => {
      const pts = seed.weeklyVolume.filter((p) => p.depot === depot && p.week === w);
      const m = meta.get(w);
      const opDays = m?.operatingDays ?? 6;
      const chilled = pts.reduce((s, p) => s + p.chilledM3, 0);
      const total = pts.reduce((s, p) => s + p.totalM3, 0);
      return {
        week: w,
        kind: pts[0]?.kind ?? "actual",
        brands: (["Fresh", "Style", "Tech"] as const).map((b) => ({ b, v: pts.find((p) => p.brand === b)?.totalM3 ?? 0 })),
        chilled, total, m, opDays,
        cap: allCap * TRIPS_PER_DAY * opDays * FILL,
        reeferCap: reeferCap * TRIPS_PER_DAY * opDays * FILL,
        reefersNeeded: Math.ceil(chilled / (avgReefer * TRIPS_PER_DAY * opDays * FILL)),
      };
    });
    return { cols, reefers: vs.filter((v) => v.temp === "reefer").length, total: vs.length };
  }, [view, depot, fleet]);

  if (!view || !data) return <Spinner />;
  const { cols } = data;
  const future = cols.filter((c) => c.kind === "forecast");
  const peak = [...future].sort((a, b) => b.total / b.cap - a.total / a.cap)[0];
  const max = Math.max(...cols.map((c) => Math.max(c.total, c.cap))) * 1.08;
  const H = 220;
  const todayVol = view.orders.reduce((s, o) => s + o.volumeM3, 0);
  const avgDay = cols.filter((c) => c.kind === "actual").reduce((s, c) => s + c.total / c.opDays, 0) / cols.filter((c) => c.kind === "actual").length;
  const forecastModel = seed.predictions?.task2a.source === "model" ? (seed.predictions.task2a.model ?? "connected") : null;

  return (
    <>
      <PageHeader
        title="Capacity outlook"
        sub={`Next ${future.length} weeks · ${depot} · weekly order volume vs practical fleet capacity`}
        chips={
          forecastModel
            ? <Pill tone="success" icon={Info} lg>Forecast: Datathon 2A model · {forecastModel}</Pill>
            : <Pill tone="info" icon={Info} lg>Forecast: baseline · Datathon 2A model plugs in here</Pill>
        }
        actions={<Seg value={fleet} onChange={setFleet} options={[{ value: "today", label: `Fleet today (${data.total})` }, { value: "full", label: "Full fleet" }]} />}
      />
      <div className="grid gap-4 p-5 lg:p-7">
        <StatStrip className="grid-cols-2 md:grid-cols-4">
          <Stat label="Tightest week" dot="warning" value={`${peak.week.slice(5)}`} sub={`${peak.m?.start?.slice(5) ?? ""} · ${peak.m?.festival ? `${peak.m.festival.replace("_", " ")} week` : "no festival"} · ${peak.opDays} operating days`} />
          <Stat label="Refrigerated need at peak" dot="chilled" tone={peak.reefersNeeded > data.reefers ? "danger" : undefined} value={<>{peak.reefersNeeded}<span className="ml-1 text-sm font-semibold tracking-normal text-ink-2">of {data.reefers} reefers</span></>} sub={`Chilled ${Math.round(peak.chilled)} m³ that week`} />
          <Stat label="Peak-day factor" dot="warning" tone="warning" value={`×${(todayVol / avgDay).toFixed(1)}`} sub={`${DEMO_DATE.slice(5)}: ${Math.round(todayVol)} m³ vs ${Math.round(avgDay)} m³ average day`} />
          <Stat label="Assumptions" value={<>{TRIPS_PER_DAY}<span className="ml-1 text-sm font-semibold tracking-normal text-ink-2">trips · {FILL * 100}% fill</span></>} sub="per vehicle per operating day" />
        </StatStrip>

        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <Card className="grid gap-3 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-bold">Weekly order volume (m³)</h2>
              {(["Fresh", "Style", "Tech"] as const).map((b) => (
                <span key={b} className="flex items-center gap-1 text-[11px] text-ink-2"><span className="size-2.5 rounded-sm" style={{ background: BRAND_COLOR[b] }} />{b}</span>
              ))}
              <span className="flex items-center gap-1 text-[11px] text-ink-2"><span className="h-0.5 w-4 bg-danger" />Practical capacity</span>
              <span className="text-[11px] text-muted">Faded = actual · solid = forecast</span>
            </div>
            <div className="overflow-x-auto">
              <svg viewBox={`0 0 ${cols.length * 56 + 20} ${H + 50}`} className="min-w-[640px]" role="img" aria-label="Weekly volume by brand with capacity line">
                {cols.map((c, i) => {
                  let y = H;
                  const x = 16 + i * 56;
                  return (
                    <g key={c.week}>
                      {c.brands.map(({ b, v }) => {
                        const h = (v / max) * H;
                        y -= h;
                        return <rect key={b} x={x} y={y} width={34} height={Math.max(h, 0)} fill={BRAND_COLOR[b]} opacity={c.kind === "actual" ? 0.45 : 1} rx={b === "Tech" ? 3 : 0}><title>{`${c.week} ${b}: ${Math.round(v)} m³`}</title></rect>;
                      })}
                      <line x1={x - 8} x2={x + 42} y1={H - (c.cap / max) * H} y2={H - (c.cap / max) * H} stroke="var(--color-danger)" strokeWidth={2} strokeDasharray="5 3" />
                      <text x={x + 17} y={H + 18} textAnchor="middle" fontSize="11" fontWeight={c.m?.festival ? 700 : 500} fill="var(--color-ink-2)">{c.week.slice(6)}</text>
                      {c.m?.festival && <text x={x + 17} y={H + 34} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--color-warning)">{c.m.festival.replace("_", " ")}</text>}
                    </g>
                  );
                })}
              </svg>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <tr><th className="px-3 py-2">Week</th><th className="px-2 py-2">Dates</th><th className="px-2 py-2 text-right">Total m³</th><th className="px-2 py-2 text-right">Chilled m³</th><th className="px-2 py-2">Reefers needed</th><th className="px-3 py-2">Utilisation</th></tr>
                </thead>
                <tbody>
                  {future.map((c) => {
                    const u = c.total / c.cap;
                    return (
                      <tr key={c.week} className="border-t border-line transition-colors hover:bg-canvas">
                        <td className="px-3 py-2 font-semibold">{c.week.slice(5)}</td>
                        <td className="px-2 py-2 text-ink-2">{c.m?.start?.slice(5)} → {c.m?.end?.slice(5)} {c.m?.festival && <Pill tone="warning" icon={CalendarClock}>{c.m.festival.replace("_", " ")}</Pill>}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{Math.round(c.total)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{Math.round(c.chilled)}</td>
                        <td className="px-2 py-2"><Pill tone={c.reefersNeeded > data.reefers ? "danger" : "success"}>{c.reefersNeeded} / {data.reefers}</Pill></td>
                        <td className="px-3 py-2"><Pill tone={u > 0.9 ? "danger" : u > 0.75 ? "warning" : "success"}>{Math.round(u * 100)}%</Pill></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="grid content-start gap-3 p-4">
            <h2 className="font-bold">Recommended actions</h2>
            {future.filter((c) => c.reefersNeeded > data.reefers).slice(0, 2).map((c) => (
              <Action key={c.week} tone="danger" title={`${c.week.slice(5)} · add ${c.reefersNeeded - data.reefers} refrigerated vehicle${c.reefersNeeded - data.reefers > 1 ? "s" : ""}`} body={`Chilled forecast ${Math.round(c.chilled)} m³ exceeds what ${data.reefers} reefers can move. Return workshop reefers first, then hire.`} />
            ))}
            {data.total < seed.vehicles.filter((v) => v.depot === depot).length && (
              <Action tone="warning" title={`${seed.vehicles.filter((v) => v.depot === depot).length - data.total} vehicles in the workshop`} body="Switch to “Full fleet” to see the outlook if they return this week — schedule repairs for the lowest-utilisation week." />
            )}
            <Action tone="warning" title={`Peak days run ×${(todayVol / avgDay).toFixed(1)} the average`} body="Weekly totals hide daily spikes before festivals. Plan relief drivers and second Fresh trips for the 3 days before each festival." />
            {future.filter((c) => c.total / c.cap < 0.6).slice(0, 1).map((c) => (
              <Action key={c.week} tone="success" title={`${c.week.slice(5)} · slack ${Math.round((1 - c.total / c.cap) * 100)}%`} body="Good week to move vehicles into the workshop for servicing." />
            ))}
            <div className="rounded-[10px] bg-subtle p-3 text-xs text-ink-2">
              <b className="block text-[11px] uppercase tracking-wide text-muted">Integration point</b>
              Forecast weeks come from <code>GET /api/forecast?depot&amp;weeks</code> (Datathon Task 2A: <code>pred_total_volume_m3</code>, <code>pred_chilled_volume_m3</code>).{" "}
              {forecastModel
                ? "They are the model's predictions."
                : "No model is connected, so this page uses a transparent baseline: mean of the last six weeks × operating days × festival uplift."}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function Action({ tone, title, body }: { tone: "danger" | "warning" | "success"; title: string; body: string }) {
  return (
    <div className="flex gap-3">
      <IconBubble icon={tone === "success" ? CheckCircle2 : AlertTriangle} tone={tone} />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-ink-2">{body}</p>
      </div>
    </div>
  );
}
