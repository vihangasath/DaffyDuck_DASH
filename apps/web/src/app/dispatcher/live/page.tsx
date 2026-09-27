"use client";
import { useMemo } from "react";
import { AlertTriangle, Box, Camera, CheckCircle2, Phone, WifiOff } from "lucide-react";
import { PageHeader, useDepot } from "@/components/dispatcher-shell";
import { Button, Card, Empty, IconBubble, Meter, Pill, Spinner, btnClass, cx, type Tone } from "@/components/ui";
import { api, type DispatchException } from "@/lib/api";
import { outletName, seed } from "@waypoint/core/reference";
import { fmtMin, toMin } from "@waypoint/core/domain/time";
import { useAct, useDepotView, useNow } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { evaluateVehicle } from "@waypoint/core/planner/evaluate";

// Approximate district centroids for a schematic (not geographic-accurate) network map.
const GEO: Record<string, [number, number]> = {
  Colombo: [79.87, 6.9], Gampaha: [80.0, 7.09], Kalutara: [79.98, 6.58], Galle: [80.22, 6.05], Matara: [80.54, 5.95], Kurunegala: [80.36, 7.49],
  Puttalam: [79.83, 8.03], Kandy: [80.63, 7.29], Matale: [80.62, 7.47], "Nuwara Eliya": [80.78, 6.97], Badulla: [81.06, 6.99], Kegalle: [80.35, 7.25],
};
const DEPOT_GEO: Record<string, [number, number]> = { Peliyagoda: [79.89, 6.96], Kandy: [80.6, 7.3] };
/** Hill-country corridors where coverage drops; silence here is expected for a while. */
const DEAD_ZONE_MIN: Record<string, number> = { Kandy: 55, Kegalle: 55, "Nuwara Eliya": 60, Badulla: 60, Matale: 45 };
const proj = ([lon, lat]: [number, number]) => [(lon - 79.6) * 330, (8.25 - lat) * 330] as const;

export default function Live() {
  const { depot } = useDepot();
  const view = useDepotView(depot);
  const [session] = useSession();
  const { run, busy } = useAct();
  const now = useNow(15_000);

  const rows = useMemo(() => {
    if (!view?.plan || view.plan.status !== "published") return [];
    const { db, plan, ctx } = view;
    return [...new Set(plan.trips.map((t) => t.vehicleId))].map((vid) => {
      const ev = evaluateVehicle(vid, plan.trips, ctx);
      const trips = ev.trips;
      const cur = trips.find((t) => t.stops.some((s) => !db.stops[s.orderId]?.deliveredAt && !db.stops[s.orderId]?.problem)) ?? trips[trips.length - 1];
      const done = cur.stops.filter((s) => db.stops[s.orderId]?.deliveredAt || db.stops[s.orderId]?.problem).length;
      const next = cur.stops.find((s) => !db.stops[s.orderId]?.deliveredAt && !db.stops[s.orderId]?.problem);
      const load = db.loads[cur.trip.id];
      const sync = db.driverSync[vid];
      const silentMin = sync ? (now - Date.parse(sync.lastSyncAt)) / 60000 : null;
      const released = load?.status === "released";
      const outlet = next ? ctx.net.outlets.get(next.outletId)! : null;
      // Baseline late risk until the Datathon Task 1 model is connected: closeness of ETA to window close.
      const risk = next && outlet ? Math.max(0, Math.min(0.95, (next.arrive - (toMin(outlet.windowClose) - 40)) / 40)) : 0;
      return { vid, ev, cur, done, next, load, released, silentMin, risk, deadZone: DEAD_ZONE_MIN[cur.trip.district] };
    });
  }, [view, now]);

  if (!view) return <Spinner />;
  const { db, plan } = view;
  if (!plan || plan.status !== "published")
    return (
      <>
        <PageHeader title="Live tracking" sub={depot} />
        <Empty icon={AlertTriangle} title="Nothing on the road yet">Publish the plan to start tracking loading and deliveries.</Empty>
      </>
    );

  const offline = rows.filter((r) => r.released && r.next && r.silentMin != null && r.silentMin > 2);
  const exceptions = db.exceptions.filter((e) => e.depot === depot && !e.resolved);
  const lateRisk = rows.filter((r) => r.released && r.risk >= 0.5);

  return (
    <>
      <PageHeader
        title="Live tracking"
        sub={`${rows.length} vehicles · ${rows.filter((r) => r.released).length} released · plan v${plan.version}`}
        chips={
          <>
            <Pill tone={exceptions.length + offline.length ? "danger" : "success"} icon={AlertTriangle} lg>{exceptions.length + offline.length} exceptions</Pill>
            <Pill tone="success" dot lg>{rows.filter((r) => r.released && r.silentMin != null && r.silentMin <= 2).length} live</Pill>
          </>
        }
      />
      <div className="grid gap-4 p-5 lg:p-7 xl:grid-cols-[1fr_360px]">
        <div className="grid content-start gap-4">
          <NetworkMap rows={rows} depot={depot} />
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                <tr><th className="px-4 py-2">Vehicle</th><th className="px-2 py-2">Trip</th><th className="px-2 py-2">Stops</th><th className="px-2 py-2">Next stop</th><th className="px-2 py-2">ETA vs window</th><th className="px-4 py-2">Status</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const o = r.next ? seed.outlets.find((x) => x.id === r.next!.outletId)! : null;
                  return (
                    <tr key={r.vid} className="border-t border-line transition-colors hover:bg-canvas">
                      <td className="px-4 py-2.5 font-semibold">{r.vid}</td>
                      <td className="px-2 py-2.5 text-ink-2">T{r.cur.trip.tripNo} · {r.cur.trip.brand} {r.cur.trip.district}</td>
                      <td className="px-2 py-2.5"><div className="flex items-center gap-2"><Meter pct={(r.done / r.cur.stops.length) * 100} className="w-16" /><span className="text-xs font-semibold">{r.done}/{r.cur.stops.length}</span></div></td>
                      <td className="px-2 py-2.5 text-ink-2">{r.next ? `${outletName(r.next.outletId)}` : "Returning to depot"}</td>
                      <td className="px-2 py-2.5">
                        {r.next && o ? (
                          <Pill tone={r.risk >= 0.5 ? "danger" : r.risk > 0.2 ? "warning" : "success"}>
                            {fmtMin(r.next.arrive)} · closes {o.windowClose}{r.risk > 0.2 ? ` · late risk ${Math.round(r.risk * 100)}%` : ""}
                          </Pill>
                        ) : <Pill>Done</Pill>}
                      </td>
                      <td className="px-4 py-2.5">
                        {!r.released ? <Pill tone={r.load?.status === "held" ? "danger" : "neutral"} icon={Box}>{r.load?.status === "held" ? "Held at dock" : "At dock"}</Pill>
                          : r.silentMin != null && r.silentMin > 2 && r.next ? <Pill tone="warning" icon={WifiOff}>No signal {Math.round(r.silentMin)} min</Pill>
                          : r.silentMin == null ? <Pill tone="neutral">Released · awaiting first sync</Pill>
                          : <Pill tone="success" dot>Live</Pill>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          <p className="text-xs text-muted">Late risk is a baseline (ETA vs window close). It will be replaced by the Datathon Task 1 lateness model via <code>pred_late_prob</code>.</p>
        </div>

        <aside className="grid content-start gap-3">
          <h2 className="flex items-center gap-2 font-bold">Exceptions <span className="text-xs font-medium text-muted">sorted by urgency</span></h2>
          {offline.map((r) => {
            const expected = r.deadZone != null && r.silentMin! < r.deadZone;
            return (
              <Card key={`off-${r.vid}`} className={cx("grid gap-2 p-3.5", expected ? "" : "border-danger/60 ring-2 ring-danger/20")}>
                <div className="flex items-center gap-2">
                  <IconBubble icon={WifiOff} tone={expected ? "info" : "danger"} />
                  <b className="flex-1 text-sm">{r.vid} · no signal</b>
                  <span className="text-xs text-muted">{Math.round(r.silentMin!)} min</span>
                </div>
                <p className="text-xs text-ink-2">
                  {r.cur.trip.district} · {r.cur.stops.length - r.done} stops pending. Last sync {new Date(db.driverSync[r.vid].lastSyncAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. The driver app keeps recording offline; records sync on reconnect.
                  {r.deadZone != null && ` Known dead zone — escalates after ${r.deadZone} min.`}
                  {" "}ETAs shown are estimates.
                </p>
                <a href="tel:+94770000000" className={cx(btnClass("secondary", "sm"), "w-fit")}><Phone className="size-3.5" /> Call driver</a>
              </Card>
            );
          })}
          {exceptions.map((e) => (
            <ExceptionCard key={e.id} e={e} busy={busy} by={session?.name ?? "Dispatcher"} run={run} shortfall={db.shortfalls.find((s) => s.id === e.ref.shortfallId)} />
          ))}
          {lateRisk.map((r) => (
            <Card key={`late-${r.vid}`} className="grid gap-1.5 p-3.5">
              <div className="flex items-center gap-2"><IconBubble icon={AlertTriangle} tone="warning" /><b className="text-sm">{outletName(r.next!.outletId)} · late risk {Math.round(r.risk * 100)}%</b></div>
              <p className="text-xs text-ink-2">{r.vid} ETA {fmtMin(r.next!.arrive)} is close to the window close. Consider notifying the store.</p>
            </Card>
          ))}
          {!offline.length && !exceptions.length && !lateRisk.length && (
            <Card className="flex items-center gap-2 p-4 text-sm text-ink-2"><CheckCircle2 className="size-5 text-success" /> No exceptions right now.</Card>
          )}
        </aside>
      </div>
    </>
  );
}

function ExceptionCard({ e, busy, by, run, shortfall }: { e: DispatchException; busy: boolean; by: string; run: ReturnType<typeof useAct>["run"]; shortfall?: { id: string; resolution?: string } }) {
  const icon = e.kind === "shortfall" ? Box : e.kind === "failed_stop" ? AlertTriangle : Camera;
  const tone: Tone = e.severity;
  return (
    <Card className={cx("grid gap-2 p-3.5", e.severity === "danger" && "border-danger/60 ring-2 ring-danger/20")}>
      <div className="flex items-center gap-2">
        <IconBubble icon={icon} tone={tone} />
        <b className="flex-1 text-sm">{e.title}</b>
        <span className="text-xs text-muted">{new Date(e.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <p className="text-xs text-ink-2">{e.body}</p>
      <div className="flex flex-wrap gap-1.5">
        {e.kind === "shortfall" && e.severity === "danger" && shortfall && !shortfall.resolution ? (
          <>
            <Button sm busy={busy} onClick={() => run(() => api.resolveShortfall(shortfall.id, "release", by), "Released — store told what to expect")}>Release with shortfall</Button>
            <Button sm kind="secondary" busy={busy} onClick={() => run(() => api.resolveShortfall(shortfall.id, "repick", by), "Loader asked to re-pick")}>Re-pick</Button>
            <Button sm kind="secondary" busy={busy} onClick={() => run(() => api.resolveShortfall(shortfall.id, "tomorrow", by), "Balance moved to tomorrow")}>Balance tomorrow</Button>
          </>
        ) : (
          <Button sm kind="soft" busy={busy} onClick={() => run(() => api.resolveException(e.id))}>Mark handled</Button>
        )}
      </div>
    </Card>
  );
}

function NetworkMap({ rows, depot }: { rows: { vid: string; cur: { trip: { district: string }; stops: unknown[] }; done: number; released: boolean; silentMin: number | null; next?: unknown; risk: number }[]; depot: string }) {
  const districts = seed.districtTravel.filter((d) => d.depot === depot);
  const [dx, dy] = proj(DEPOT_GEO[depot]);
  const pts = [[dx, dy], ...districts.map((d) => proj(GEO[d.district]))];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const box = [Math.min(...xs) - 90, Math.min(...ys) - 50, Math.max(...xs) - Math.min(...xs) + 220, Math.max(...ys) - Math.min(...ys) + 110];
  const byDistrict = new Map<string, typeof rows>();
  for (const r of rows) byDistrict.set(r.cur.trip.district, [...(byDistrict.get(r.cur.trip.district) ?? []), r]);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3">
        <h2 className="font-bold">Network · {depot}</h2>
        <span className="text-[11px] text-muted">Schematic — district positions approximate</span>
      </div>
      <div className="grid gap-2 p-3 md:grid-cols-[260px_1fr]">
      <svg viewBox={box.join(" ")} className="h-[340px] w-full" role="img" aria-label={`Schematic map of ${depot} districts with vehicles`}>
        <rect x={box[0]} y={box[1]} width={box[2]} height={box[3]} rx={18} fill="var(--color-canvas)" />
        {districts.map((d) => {
          const [x, y] = proj(GEO[d.district]);
          const active = byDistrict.has(d.district);
          return <line key={d.district} x1={dx} y1={dy} x2={x} y2={y} stroke={active ? "var(--color-primary)" : "var(--color-line-strong)"} strokeOpacity={active ? 0.55 : 1} strokeWidth={active ? 4 : 2} strokeLinecap="round" strokeDasharray={active ? undefined : "4 6"} />;
        })}
        {districts.map((d) => {
          const [x, y] = proj(GEO[d.district]);
          const vs = byDistrict.get(d.district) ?? [];
          const bad = vs.some((v) => v.released && v.next && v.silentMin != null && v.silentMin > 2);
          const late = vs.some((v) => v.released && v.risk >= 0.5);
          return (
            <g key={d.district}>
              {vs.length > 0 && <circle cx={x} cy={y} r={22 + vs.length * 2} fill={bad ? "var(--color-warning)" : late ? "var(--color-danger)" : "var(--color-primary)"} opacity={0.14} />}
              <circle cx={x} cy={y} r={vs.length ? 16 + vs.length * 2 : 9} fill={vs.length ? (bad ? "var(--color-warning)" : late ? "var(--color-danger)" : "var(--color-primary)") : "var(--color-line-strong)"} stroke="#fff" strokeWidth={vs.length ? 3 : 2} />
              {vs.length > 0 && <text x={x} y={y + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill="#fff">{vs.length}</text>}
              <text x={x} y={y + (vs.length ? 38 : 26)} textAnchor="middle" fontSize="16" fontWeight="600" fill="var(--color-ink-2)">{d.district}</text>
            </g>
          );
        })}
        <rect x={dx - 15} y={dy - 15} width={30} height={30} rx={8} fill="var(--color-navy)" stroke="#fff" strokeWidth={3} />
        <circle cx={dx} cy={dy} r={5} fill="var(--color-mint)" />
        <text x={dx + 18} y={dy + 5} fontSize="15" fontWeight="700" fill="var(--color-ink)">{depot === "Kandy" ? "Kandy hub" : "Peliyagoda DC"}</text>
      </svg>
      <ul className="grid content-start gap-1.5 text-sm">
        {districts.map((d) => {
          const vs = byDistrict.get(d.district) ?? [];
          const stops = vs.reduce((n, v) => n + v.cur.stops.length, 0);
          const done = vs.reduce((n, v) => n + v.done, 0);
          const silent = vs.filter((v) => v.released && v.next && v.silentMin != null && v.silentMin > 2).length;
          return (
            <li key={d.district} className={cx("flex items-center gap-3 rounded-lg border px-3 py-2", vs.length ? "border-line bg-surface" : "border-transparent bg-canvas text-ink-2")}>
              <span className="w-28 font-semibold">{d.district}</span>
              <span className="text-xs text-ink-2">{d.depotToDistrictMin} min · {d.roadClass}</span>
              <span className="ml-auto flex items-center gap-2">
                {vs.length ? <Meter pct={stops ? (done / stops) * 100 : 0} className="w-20" /> : null}
                <span className="w-24 text-right text-xs font-semibold">{vs.length ? `${vs.length} veh · ${done}/${stops}` : "no trips"}</span>
                {silent > 0 && <Pill tone="warning" icon={WifiOff}>{silent}</Pill>}
              </span>
            </li>
          );
        })}
      </ul>
      </div>
    </Card>
  );
}
