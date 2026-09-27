"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { AlertTriangle, Download, Info } from "lucide-react";
import { PageHeader, useDepot } from "@/components/dispatcher-shell";
import { BrandPill, Button, Card, Meter, Pill, Seg, Spinner, Stat, StatStrip, cx, type Tone } from "@/components/ui";
import { DEMO_DATE, net, outletName, seed } from "@waypoint/core/reference";
import { useDepotView } from "@/lib/hooks";

export default function DeferralsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Deferrals />
    </Suspense>
  );
}

function Deferrals() {
  const { depot } = useDepot();
  const view = useDepotView(depot);
  const focus = useSearchParams().get("outlet");
  const [show, setShow] = useState<"risk" | "all">("risk");

  const rows = useMemo(() => {
    if (!view) return [];
    const { plan, orders } = view;
    const deferredToday = new Set(plan?.status === "published" ? plan.deferred.map((d) => orders.find((o) => o.id === d.orderId)?.outletId) : []);
    const servedToday = new Set(plan?.status === "published" ? plan.trips.flatMap((t) => t.orderIds).map((id) => orders.find((o) => o.id === id)?.outletId) : []);
    const orderedToday = new Set(orders.map((o) => o.outletId));
    return seed.serviceHistory
      .filter((h) => net.outlets.get(h.outletId)!.depot === depot)
      .map((h) => {
        const today = deferredToday.has(h.outletId) ? "D" : servedToday.has(h.outletId) ? "S" : orderedToday.has(h.outletId) ? "P" : "N";
        const days = h.days + today;
        const streak = days.match(/D+[NP]*$/)?.[0].replace(/[NP]/g, "").length ?? 0;
        const total = [...days].filter((c) => c === "D").length;
        return { outletId: h.outletId, days, streak, total };
      })
      .sort((a, b) => b.streak - a.streak || b.total - a.total || a.outletId.localeCompare(b.outletId));
  }, [view, depot]);

  if (!view) return <Spinner />;
  const log = view.db.deferralLog.filter((d) => net.outlets.get(d.outletId)?.depot === depot);
  const atRisk = rows.filter((r) => r.streak >= 2);
  const shown = show === "risk" ? rows.filter((r) => r.total > 0 || r.outletId === focus) : rows;
  const reasons = Object.entries(
    log.reduce<Record<string, number>>((m, d) => {
      const k = d.code === "HISTORICAL" ? "Historical (reason not captured)" : d.reason.split(".")[0];
      m[k] = (m[k] ?? 0) + 1;
      return m;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const days = [...seed.meta.historyDays.map((d) => d.slice(8)), DEMO_DATE.slice(8)];

  const exportCsv = () => {
    const csv = ["date,order,outlet,brand,temp,volume_m3,code,reason,decided_by,store_notified", ...log.map((d) => [d.date, d.orderId, d.outletId, d.brand, d.temp, d.volumeM3, d.code, `"${d.reason.replaceAll('"', "'")}"`, d.decidedBy, d.storeNotified].join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `deferral-log-${depot}.csv`;
    a.click();
  };

  return (
    <>
      <PageHeader
        title="Deferrals & fairness"
        sub={`Last ${days.length - 1} operating days + today · ${depot}`}
        chips={atRisk.length ? <Pill tone="danger" icon={AlertTriangle} lg>{atRisk.length} outlet{atRisk.length > 1 ? "s" : ""} skipped 2+ runs in a row</Pill> : <Pill tone="success" lg>No repeat skips</Pill>}
        actions={<Button kind="secondary" icon={Download} onClick={exportCsv}>Export audit log</Button>}
      />
      <div className="grid gap-4 p-5 lg:p-7">
        <StatStrip className="grid-cols-2 md:grid-cols-4">
          <Stat label="Deferral records" value={log.length} sub="in the log" />
          <Stat label="Skipped 2+ runs in a row" dot={atRisk.length ? "danger" : "success"} tone={atRisk.length ? "danger" : undefined} value={atRisk.length} sub="target: 0" />
          <Stat label="Outlets affected" value={rows.filter((r) => r.total).length} sub={`of ${rows.length}`} />
          <Stat label="Store notified" dot="success" value={log.filter((d) => d.storeNotified).length} sub="since the system went live" />
        </StatStrip>
        <div className="grid gap-4 xl:grid-cols-[1fr_440px]">
          <Card className="grid content-start gap-3 overflow-x-auto p-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-bold">Service history by outlet</h2>
              <div className="flex gap-3 text-[11px] text-ink-2">
                {([["bg-success", "Served"], ["bg-danger", "Deferred"], ["bg-subtle", "No order"], ["border-2 border-dashed border-primary/60", "Planned today"]] as const).map(([c, l]) => (
                  <span key={l} className="flex items-center gap-1"><span className={cx("size-2.5 rounded-sm", c)} />{l}</span>
                ))}
              </div>
              <div className="ml-auto"><Seg value={show} onChange={setShow} options={[{ value: "risk", label: "With deferrals" }, { value: "all", label: "All outlets" }]} /></div>
            </div>
            <div className="grid min-w-[620px] gap-0.5">
              <div className="flex items-center gap-3 pb-1">
                <span className="w-56" />
                <div className="flex gap-[3px]">{days.map((d, i) => <span key={i} className={cx("w-4 text-center text-[9px] font-medium", i === days.length - 1 ? "font-bold text-ink" : "text-muted")}>{d}</span>)}</div>
              </div>
              {shown.map((r) => {
                const o = net.outlets.get(r.outletId)!;
                const tone: Tone = r.streak >= 2 ? "danger" : r.streak === 1 ? "warning" : r.total ? "neutral" : "success";
                return (
                  <div key={r.outletId} className={cx("flex items-center gap-3 border-b border-line py-1.5", focus === r.outletId && "bg-primary-soft")}>
                    <span className="flex w-56 items-center gap-2 truncate text-[13px]">
                      <b>{r.outletId}</b> <span className="truncate text-ink-2">{outletName(r.outletId)}</span> <BrandPill brand={o.brand} />
                    </span>
                    <div className="flex gap-[3px]">
                      {[...r.days].map((c, i) => (
                        <span key={i} title={`${days[i]} Dec: ${c === "S" ? "served" : c === "D" ? "deferred" : c === "P" ? "planned" : "no order"}`} className={cx("size-4 rounded-[5px]", c === "S" ? "bg-success" : c === "D" ? "bg-danger" : c === "P" ? "border-2 border-dashed border-primary/60" : "bg-subtle")} />
                      ))}
                    </div>
                    <Pill tone={tone} dot className="ml-auto">{r.streak >= 2 ? `${r.streak} in a row` : r.streak === 1 ? "Skipped last run" : r.total ? `${r.total} in ${days.length} days` : "Healthy"}</Pill>
                  </div>
                );
              })}
            </div>
            <p className="flex items-start gap-2 rounded-[10px] bg-info-soft p-3 text-xs">
              <Info className="size-4 shrink-0 text-info" /> Fairness rule used by auto-plan: an outlet skipped on the previous run is placed first in its vehicle pool (+30 priority). A third consecutive deferral should be signed off by the operations manager.
            </p>
          </Card>
          <div className="grid content-start gap-4">
            <Card className="grid gap-2.5 p-4">
              <h2 className="font-bold">Deferral reasons</h2>
              {reasons.map(([r, n]) => (
                <div key={r} className="grid gap-1">
                  <div className="flex justify-between gap-2 text-xs"><span className="font-medium">{r}</span><span className="font-semibold text-ink-2">{n}</span></div>
                  <Meter pct={(n / log.length) * 100} tone={r.startsWith("All available refrigerated") ? "danger" : "neutral"} />
                </div>
              ))}
            </Card>
            <Card className="overflow-hidden">
              <h2 className="px-4 py-3 font-bold">Deferral log</h2>
              <div className="max-h-[520px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-subtle text-left text-[10px] font-semibold uppercase tracking-wide text-muted">
                    <tr><th className="px-3 py-2">Date</th><th className="px-2 py-2">Order</th><th className="px-2 py-2">Reason</th><th className="px-3 py-2">By · notified</th></tr>
                  </thead>
                  <tbody>
                    {log.slice(0, 60).map((d, i) => (
                      <tr key={`${d.orderId}-${i}`} className="border-t border-line align-top">
                        <td className="whitespace-nowrap px-3 py-2">{d.date.slice(5)}</td>
                        <td className="px-2 py-2"><b>{d.orderId}</b><br /><span className="text-ink-2">{outletName(d.outletId)} · {d.temp}</span></td>
                        <td className="px-2 py-2 text-ink-2">{d.code === "HISTORICAL" ? <span className="text-muted">Not captured (legacy)</span> : d.reason}</td>
                        <td className="px-3 py-2">{d.decidedBy}<br />{d.storeNotified ? <Pill tone="success">Notified</Pill> : <Pill>Not notified</Pill>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
