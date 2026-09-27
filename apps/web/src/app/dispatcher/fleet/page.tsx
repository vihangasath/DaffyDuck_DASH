"use client";
import { useMemo, useState } from "react";
import { Fuel, Snowflake, Truck, Wrench } from "lucide-react";
import { PageHeader, useDepot } from "@/components/dispatcher-shell";
import { Button, Card, Meter, Pill, Seg, Spinner, Stat, StatStrip, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { seed } from "@waypoint/core/reference";
import { useAct, useDepotView } from "@/lib/hooks";
import { evaluateVehicle } from "@waypoint/core/planner/evaluate";

export default function Fleet() {
  const { depot } = useDepot();
  const view = useDepotView(depot);
  const { run, busy } = useAct();
  const [kind, setKind] = useState<"all" | "reefer" | "ambient" | "van">("all");

  const rows = useMemo(() => {
    if (!view) return [];
    return seed.vehicles
      .filter((v) => v.depot === depot)
      .map((v) => {
        const ev = view.plan ? evaluateVehicle(v.id, view.plan.trips, view.ctx) : null;
        const used = view.ctx.fuelUsedL.get(v.id) ?? 0;
        const today = ev?.fuelTodayL ?? 0;
        return { v, status: view.db.fleetStatus[v.id], trips: ev?.trips.length ?? 0, used, today, pct: ((used + today) / v.weeklyFuelQuotaL) * 100 };
      });
  }, [view, depot]);

  if (!view) return <Spinner />;
  const shown = rows.filter((r) => kind === "all" || (kind === "reefer" ? r.v.temp === "reefer" : kind === "van" ? r.v.type === "van" : r.v.temp === "ambient" && r.v.type === "truck"));
  const avail = rows.filter((r) => r.status === "available");
  const reefers = rows.filter((r) => r.v.temp === "reefer");
  const quota = rows.reduce((s, r) => s + r.v.weeklyFuelQuotaL, 0);
  const usedAll = rows.reduce((s, r) => s + r.used + r.today, 0);
  const worst = [...rows].sort((a, b) => b.pct - a.pct)[0];

  return (
    <>
      <PageHeader title="Fleet & fuel" sub={`${rows.length} vehicles · ${depot} · weekly fuel quotas include today’s plan`} />
      <div className="grid gap-4 p-5 lg:p-7">
        <StatStrip className="grid-cols-2 md:grid-cols-4">
          {([
            ["Available", `${avail.length}/${rows.length}`, `${rows.length - avail.length} in workshop`, (avail.length / rows.length) * 100, "primary"],
            ["Refrigerated available", `${reefers.filter((r) => r.status === "available").length}/${reefers.length}`, "trucks + vans", (reefers.filter((r) => r.status === "available").length / reefers.length) * 100, "chilled"],
            ["Vans (van-only outlets)", `${rows.filter((r) => r.v.type === "van" && r.status === "available").length}/${rows.filter((r) => r.v.type === "van").length}`, "narrow-access stops", 100, "primary"],
            ["Fleet fuel this week", `${Math.round((usedAll / quota) * 100)}%`, `${Math.round(usedAll)} of ${quota} L`, (usedAll / quota) * 100, undefined],
          ] as const).map(([l, v, s, p, t]) => (
            <Stat key={l} label={l} value={v} sub={s} meter={{ pct: p, tone: t }} />
          ))}
        </StatStrip>
        <div className="flex flex-wrap items-center gap-2">
          <Seg value={kind} onChange={setKind} options={[{ value: "all", label: "All" }, { value: "reefer", label: "Reefer" }, { value: "ambient", label: "Dry-box" }, { value: "van", label: "Van" }]} />
          {view.plan?.status === "published" && <span className="text-xs text-muted">Workshop changes after publishing need a re-plan of affected trips.</span>}
        </div>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
              <tr><th className="px-4 py-2">Vehicle</th><th className="px-2 py-2">Type</th><th className="px-2 py-2">Capacity</th><th className="px-2 py-2">Weekly fuel quota</th><th className="px-2 py-2">Trips today</th><th className="px-4 py-2">Status</th></tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.v.id} className={cx("border-t border-line transition-colors hover:bg-canvas", r.status !== "available" && "bg-canvas/60 text-ink-2")}>
                  <td className="px-4 py-2.5 font-semibold">{r.v.id}</td>
                  <td className="px-2 py-2.5">
                    <Pill tone={r.v.temp === "reefer" ? "chilled" : "neutral"} icon={r.v.temp === "reefer" ? Snowflake : Truck}>{r.v.temp === "reefer" ? "Reefer" : "Dry-box"} {r.v.type}</Pill>
                  </td>
                  <td className="px-2 py-2.5 text-ink-2">{r.v.volumeCapM3} m³ · {r.v.weightCapKg.toLocaleString()} kg</td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2">
                      <Meter pct={r.pct} className="w-28" />
                      <span className={cx("text-xs font-semibold tabular-nums", r.pct > 90 && "text-danger")}>{Math.round(r.pct)}%</span>
                      <span className="text-[11px] text-muted">{Math.round(r.used + r.today)}/{r.v.weeklyFuelQuotaL} L</span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5">{r.trips || "—"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {r.status === "available" ? <Pill tone="success" dot>Available</Pill> : <Pill tone="danger" icon={Wrench}>Workshop</Pill>}
                      <Button sm kind="ghost" busy={busy} disabled={r.trips > 0 && r.status === "available"} title={r.trips ? "Move its trips first" : undefined} onClick={() => run(() => api.setVehicleStatus(r.v.id, r.status === "available" ? "in_workshop" : "available"), r.status === "available" ? `${r.v.id} marked in workshop` : `${r.v.id} back in service`)}>
                        {r.status === "available" ? "To workshop" : "Return"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        {worst && worst.pct > 80 && (
          <p className="flex items-center gap-2 rounded-[10px] bg-warning-soft p-3 text-sm">
            <Fuel className="size-4 text-warning" /> {worst.v.id} is at {Math.round(worst.pct)}% of its weekly quota. The planner will refuse any trip that would push it over.
          </p>
        )}
      </div>
    </>
  );
}
