"use client";
import { useMemo } from "react";
import { AlertTriangle, Box, Camera, CheckCircle2, CloudUpload, KeyRound, MessageSquareReply, Phone, Timer, WifiOff } from "lucide-react";
import { PageHeader, useDepot } from "@/components/dispatcher-shell";
import { Button, Card, Empty, IconBubble, Meter, Pill, Spinner, btnClass, cx, type Tone } from "@/components/ui";
import { api, type Db, type DispatchException, type Shortfall } from "@/lib/api";
import { net, outletName, seed } from "@waypoint/core/reference";
import { fmtMin, fmtClock } from "@waypoint/core/domain/time";
import { useAct, useDepotView, useNow } from "@/lib/hooks";
import { evaluateVehicle } from "@waypoint/core/planner/evaluate";
import { DWELL_BUFFER_MIN, LATE_NOTICE_MIN, liveRun, overstaying, type LiveStop } from "@waypoint/core/live";
import { baselineLateRisk } from "@waypoint/core/predictions";
import { EvidenceBlock } from "@/components/dispatch/delivery";
import { FleetMap, type FleetDot } from "@/components/dispatch/fleet-map";
import { PhotoStrip, photoRefs } from "@/components/photos";
import { CALL } from "@/lib/contacts";

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
  const { run, busy } = useAct();
  const now = useNow(15_000);

  const rows = useMemo(() => {
    if (!view?.plan || view.plan.status !== "published") return [];
    const { db, plan, ctx } = view;
    return [...new Set(plan.trips.map((t) => t.vehicleId))].map((vid) => {
      const ev = evaluateVehicle(vid, plan.trips, ctx);
      const trips = ev.trips;
      // Where the run actually is: recorded times, dwell at the current stop, and what that does to later stops.
      const live = new Map(liveRun(vid, trips, db, now).trips.flatMap((t) => t.stops).map((s) => [s.orderId, s]));
      const here = [...live.values()].find((s) => s.state === "here");
      const cur = trips.find((t) => t.stops.some((s) => !db.stops[s.orderId]?.deliveredAt && !db.stops[s.orderId]?.problem)) ?? trips[trips.length - 1];
      const done = cur.stops.filter((s) => db.stops[s.orderId]?.deliveredAt || db.stops[s.orderId]?.problem).length;
      const next = cur.stops.find((s) => !db.stops[s.orderId]?.deliveredAt && !db.stops[s.orderId]?.problem);
      const load = db.loads[cur.trip.id];
      const sync = db.driverSync[vid];
      const silentMin = sync ? (now - Date.parse(sync.lastSyncAt)) / 60000 : null;
      const released = load?.status === "released";
      // Task 1 pred_late_prob when the model is connected, else the ETA-vs-window baseline.
      // A trip is as late-risk as its worst stop still to come, not just the next one.
      // The live projection raises the risk when the run has fallen behind the plan.
      const pending = cur.stops.filter((s) => !db.stops[s.orderId]?.deliveredAt && !db.stops[s.orderId]?.problem);
      const riskOf = (s: (typeof pending)[number]) => Math.max(s.lateRisk, baselineLateRisk(live.get(s.orderId)?.arrive ?? s.arrive, net.outlets.get(s.outletId)!));
      const riskStop = pending.reduce<(typeof pending)[number] | undefined>((w, s) => (!w || riskOf(s) > riskOf(w) ? s : w), undefined);
      const risk = riskStop ? riskOf(riskStop) : 0;
      const deadZone = DEAD_ZONE_MIN[cur.trip.district];
      const silent = released && !!next && silentMin != null && silentMin > 2;
      // Exceptions first: held at the dock, then late risk (worst first), then lost signal, then the rest.
      const rank =
        load?.status === "held" ? 0
        : here && overstaying(here) ? 1
        : risk >= 0.5 ? 1
        : silent && !(deadZone != null && silentMin! < deadZone) ? 2
        : risk > 0.2 ? 3
        : silent ? 4
        : !next ? 7
        : released ? 5 : 6;
      return { vid, ev, cur, done, next, load, released, silentMin, risk, riskStop, deadZone, rank, live, here };
    }).sort((a, b) => a.rank - b.rank || b.risk - a.risk || a.vid.localeCompare(b.vid));
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
  const lateRisk = rows.filter((r) => r.risk >= 0.5 && r.riskStop);
  // Phones whose records haven't all reached the database (or have been waiting on the phone a while).
  const syncIssues = rows.flatMap((r) => {
    const c = db.driverSync[r.vid]?.check;
    if (!c) return [];
    const stuck = c.phoneQueued > 0 && c.oldestQueuedAt != null && now - Date.parse(c.oldestQueuedAt) > 10 * 60_000;
    return c.missing.length || stuck ? [{ r, c, missing: c.missing.length > 0 }] : [];
  });
  const SEVERITY = { danger: 0, warning: 2, info: 3 } as const;
  // One urgency-ordered list for the sidebar: danger exceptions and silent-too-long vehicles, then late risk, then the rest.
  const alerts = [
    ...exceptions.map((e) => ({ key: e.id, urgency: e.kind === "dwell" ? 1 : SEVERITY[e.severity], at: e.at, kind: "exception" as const, e })),
    ...offline.map((r) => ({ key: `off-${r.vid}`, urgency: r.deadZone != null && r.silentMin! < r.deadZone ? 3 : 0, at: "", kind: "offline" as const, r })),
    ...lateRisk.map((r) => ({ key: `late-${r.vid}`, urgency: 1, at: "", kind: "late" as const, r })),
    ...syncIssues.map((x) => ({ key: `sync-${x.r.vid}`, urgency: x.missing ? 1 : 2, at: "", kind: "sync" as const, x })),
  ].sort((a, b) => a.urgency - b.urgency || (a.kind === "late" && b.kind === "late" ? b.r.risk - a.r.risk : 0) || b.at.localeCompare(a.at));
  const dots: FleetDot[] = rows.flatMap((r) => {
    const s = db.driverSync[r.vid];
    if (!s?.position) return [];
    const note = r.here ? `At ${outletName(r.here.outletId)} · ${Math.round(r.here.dwellMin ?? 0)} min` : r.next ? `Next: ${outletName(r.next.outletId)}` : "Run complete";
    return [{ vehicleId: r.vid, position: s.position, trail: s.trail ?? [], note, alert: r.rank <= 1 }];
  });

  return (
    <>
      <PageHeader
        title="Live tracking"
        sub={`${rows.length} vehicles · ${rows.filter((r) => r.released).length} released · plan v${plan.version}`}
        chips={
          <>
            <Pill tone={alerts.length ? "danger" : "success"} icon={AlertTriangle} lg>{alerts.length} exception{alerts.length === 1 ? "" : "s"}</Pill>
            <Pill tone="success" dot lg>{rows.filter((r) => r.released && r.silentMin != null && r.silentMin <= 2).length} live</Pill>
          </>
        }
      />
      <div className="grid gap-4 p-5 lg:p-7 xl:grid-cols-[1fr_360px]">
        <div className="grid content-start gap-4">
          <FleetMap depot={depot} dots={dots} now={now} />
          <NetworkMap rows={rows} depot={depot} />
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                <tr><th className="px-4 py-2">Vehicle</th><th className="px-2 py-2">Trip</th><th className="px-2 py-2">Stops</th><th className="px-2 py-2">Next stop</th><th className="px-2 py-2">ETA vs window</th><th className="px-4 py-2">Status</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const o = r.next ? seed.outlets.find((x) => x.id === r.next!.outletId)! : null;
                  const at = r.riskStop && r.riskStop.orderId !== r.next?.orderId && r.risk > 0.2 ? r.riskStop : null;
                  const atOutlet = at ? seed.outlets.find((x) => x.id === at.outletId)! : null;
                  const nextLive = r.next ? r.live.get(r.next.orderId) : undefined;
                  const atLive = at ? r.live.get(at.orderId) : undefined;
                  return (
                    <tr key={r.vid} className={cx("border-t border-line transition-colors hover:bg-canvas", r.rank <= 1 && "bg-danger-soft/40")}>
                      <td className="px-4 py-2.5 font-semibold">{r.vid}</td>
                      <td className="px-2 py-2.5 text-ink-2">T{r.cur.trip.tripNo} · {r.cur.trip.brand} {r.cur.trip.district}</td>
                      <td className="px-2 py-2.5"><div className="flex items-center gap-2"><Meter pct={(r.done / r.cur.stops.length) * 100} className="w-16" /><span className="text-xs font-semibold">{r.done}/{r.cur.stops.length}</span></div></td>
                      <td className="px-2 py-2.5 text-ink-2">{r.next ? `${outletName(r.next.outletId)}` : "Returning to depot"}</td>
                      <td className="px-2 py-2.5">
                        {r.next && o ? (
                          at && atOutlet ? (
                            <Pill tone={r.risk >= 0.5 ? "danger" : "warning"}>
                              Stop {at.seq + 1} {outletName(at.outletId)} {fmtMin(atLive?.arrive ?? at.arrive)}{slip(atLive)} · closes {atOutlet.windowClose} · late risk {Math.round(r.risk * 100)}%
                            </Pill>
                          ) : (
                            <Pill tone={r.risk >= 0.5 ? "danger" : r.risk > 0.2 ? "warning" : "success"}>
                              {fmtMin(nextLive?.arrive ?? r.next.arrive)}{slip(nextLive)} · closes {o.windowClose}{r.risk > 0.2 ? ` · late risk ${Math.round(r.risk * 100)}%` : ""}
                            </Pill>
                          )
                        ) : <Pill>Done</Pill>}
                      </td>
                      <td className="px-4 py-2.5">
                        {!r.released ? <Pill tone={r.load?.status === "held" ? "danger" : "neutral"} icon={Box}>{r.load?.status === "held" ? "Held at dock" : "At dock"}</Pill>
                          : r.here ? <Pill tone={overstaying(r.here) ? "danger" : "info"} icon={Timer}>At stop {Math.round(r.here.dwellMin ?? 0)} min · expected {Math.round(r.here.serviceMin)}</Pill>
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
          <SyncTable rows={rows} db={db} now={now} />
          <p className="text-xs text-muted">
            ETAs move with the run: recorded arrivals and deliveries, and time spent at the current stop. A stop projected {LATE_NOTICE_MIN}+ min past its window tells the store automatically; a stop {DWELL_BUFFER_MIN} min past its expected unloading time alerts you here.{" "}
            {seed.predictions?.task1.source === "model"
              ? <>Late risk and ETAs come from the Datathon Task 1 model ({seed.predictions.task1.model ?? "connected"}): <code>pred_late_prob</code> and <code>pred_service_min</code>.</>
              : <>Late risk is a baseline (ETA vs window close). It will be replaced by the Datathon Task 1 lateness model via <code>pred_late_prob</code>.</>}
          </p>
        </div>

        <aside className="grid content-start gap-3">
          <h2 className="flex items-center gap-2 font-bold">Exceptions <span className="text-xs font-medium text-muted">sorted by urgency</span></h2>
          {alerts.map((a) => {
            if (a.kind === "exception") return <ExceptionCard key={a.key} e={a.e} db={db} now={now} busy={busy} run={run} shortfall={db.shortfalls.find((s) => s.id === a.e.ref.shortfallId)} />;
            if (a.kind === "sync") return <SyncCard key={a.key} vid={a.x.r.vid} c={a.x.c} />;
            const r = a.r;
            if (a.kind === "late") {
              const lv = r.live.get(r.riskStop!.orderId);
              const told = db.notices.find((n) => n.kind === "late" && n.orderId === r.riskStop!.orderId);
              return (
                <Card key={a.key} className="grid gap-1.5 border-danger/40 p-3.5">
                  <div className="flex items-center gap-2"><IconBubble icon={AlertTriangle} tone="danger" /><b className="text-sm">{outletName(r.riskStop!.outletId)} · late risk {Math.round(r.risk * 100)}%</b></div>
                  <p className="text-xs text-ink-2">
                    {r.vid} stop {r.riskStop!.seq + 1}: ETA {fmtMin(lv?.arrive ?? r.riskStop!.arrive)}{slip(lv)}
                    {lv && lv.lateMin > 0 ? `, about ${Math.ceil(lv.lateMin)} min after the window closes.` : " is close to the window close."}
                    {!r.released && " Still at the dock: a move or an earlier departure can save it."}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs font-semibold">
                    <MessageSquareReply className="size-3.5 text-ink-2" />
                    {told
                      ? <>Store told {fmtClock(told.at)} (about {told.lateMin} min) · {told.acknowledged === "ok" ? <span className="text-success">accepted</span> : told.acknowledged === "reduce" ? <span className="text-warning">asked to reduce the order</span> : <span className="text-ink-2">no reply yet</span>}</>
                      : <span className="font-medium text-ink-2">The store is told automatically if it is projected {LATE_NOTICE_MIN}+ min late.</span>}
                  </p>
                </Card>
              );
            }
            const expected = r.deadZone != null && r.silentMin! < r.deadZone;
            return (
              <Card key={a.key} className={cx("grid gap-2 p-3.5", expected ? "" : "border-danger/60 ring-2 ring-danger/20")}>
                <div className="flex items-center gap-2">
                  <IconBubble icon={WifiOff} tone={expected ? "info" : "danger"} />
                  <b className="flex-1 text-sm">{r.vid} · no signal</b>
                  <span className="text-xs text-muted">{Math.round(r.silentMin!)} min</span>
                </div>
                <p className="text-xs text-ink-2">
                  {r.cur.trip.district} · {r.cur.stops.length - r.done} stops pending. Last sync {fmtClock(db.driverSync[r.vid].lastSyncAt)}. The driver app keeps recording offline; records sync on reconnect.
                  {r.deadZone != null && ` Known dead zone — escalates after ${r.deadZone} min.`}
                  {" "}ETAs shown are estimates.
                </p>
                <a href={CALL.driver} className={cx(btnClass("secondary", "sm"), "w-fit")}><Phone className="size-3.5" /> Call driver</a>
              </Card>
            );
          })}
          {!alerts.length && (
            <Card className="flex items-center gap-2 p-4 text-sm text-ink-2"><CheckCircle2 className="size-5 text-success" /> No exceptions right now.</Card>
          )}
        </aside>
      </div>
    </>
  );
}

const ICON: Record<DispatchException["kind"], typeof Box> = {
  shortfall: Box, failed_stop: AlertTriangle, receipt_issue: Camera, delivered_with_issue: Camera, dwell: Timer, pod_code: KeyRound, late_reply: MessageSquareReply,
};

/** "+12 min" when the live projection has slipped from the plan. */
const slip = (s?: LiveStop) => {
  const d = s ? Math.round(s.arrive - s.plannedArrive) : 0;
  return d >= 3 ? ` (+${d} min)` : "";
};

function ExceptionCard({ e, db, now, busy, run, shortfall }: { e: DispatchException; db: Db; now: number; busy: boolean; run: ReturnType<typeof useAct>["run"]; shortfall?: Shortfall }) {
  const icon = ICON[e.kind] ?? Camera;
  const tone: Tone = e.severity;
  const stop = e.ref.orderId ? db.stops[e.ref.orderId] : undefined;
  // A dwell alert keeps counting while the driver is still there.
  const dwelling = e.kind === "dwell" && stop?.arrivedAt && !stop.deliveredAt && !stop.problem ? Math.round((now - Date.parse(stop.recordedAt)) / 60_000) : null;
  return (
    <Card className={cx("grid gap-2 p-3.5", e.severity === "danger" && "border-danger/60 ring-2 ring-danger/20")}>
      <div className="flex items-center gap-2">
        <IconBubble icon={icon} tone={tone} />
        <b className="flex-1 text-sm">{e.title}</b>
        <span className="text-xs text-muted">{fmtClock(e.at)}</span>
      </div>
      <p className="text-xs text-ink-2">{e.body}</p>
      {dwelling != null && <p className="flex items-center gap-1.5 text-xs font-semibold text-warning"><Timer className="size-3.5" /> Still there · {dwelling} min so far</p>}
      {e.kind === "shortfall" && shortfall?.photoIds?.length ? <PhotoStrip photos={photoRefs(shortfall.photoIds, db.photos, `Dock · ${shortfall.name}`)} /> : null}
      {e.ref.orderId && ["receipt_issue", "pod_code", "delivered_with_issue"].includes(e.kind) && <EvidenceBlock db={db} orderId={e.ref.orderId} />}
      {e.kind === "dwell" && <a href={CALL.driver} className={cx(btnClass("secondary", "sm"), "w-fit")}><Phone className="size-3.5" /> Call driver</a>}
      <div className="flex flex-wrap gap-1.5">
        {e.kind === "shortfall" && e.severity === "danger" && shortfall && !shortfall.resolution ? (
          <>
            <Button sm busy={busy} onClick={() => run(() => api.resolveShortfall(shortfall.id, "release"), "Released — store told what to expect")}>Release with shortfall</Button>
            <Button sm kind="secondary" busy={busy} onClick={() => run(() => api.resolveShortfall(shortfall.id, "repick"), "Loader asked to re-pick")}>Re-pick</Button>
            <Button sm kind="secondary" busy={busy} onClick={() => run(() => api.resolveShortfall(shortfall.id, "tomorrow"), "Balance moved to tomorrow")}>Balance tomorrow</Button>
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

/** A phone whose records haven't all reached the database. */
function SyncCard({ vid, c }: { vid: string; c: NonNullable<Db["driverSync"][string]["check"]> }) {
  return (
    <Card className={cx("grid gap-1.5 p-3.5", c.missing.length && "border-danger/60 ring-2 ring-danger/20")}>
      <div className="flex items-center gap-2">
        <IconBubble icon={CloudUpload} tone={c.missing.length ? "danger" : "warning"} />
        <b className="flex-1 text-sm">{vid} · {c.missing.length ? `${c.missing.length} record${c.missing.length > 1 ? "s" : ""} missing` : `${c.phoneQueued} waiting on the phone`}</b>
      </div>
      <p className="text-xs text-ink-2">
        {c.missing.length
          ? "The phone marks these as sent but the database doesn’t have them. The phone is sending them again; if this stays, ask the driver to open Outbox."
          : `Oldest since ${fmtClock(c.oldestQueuedAt!)}. Usually a dock not released yet or a weak signal.`}
      </p>
    </Card>
  );
}

/** Offline spells for one phone today, from its connectivity log (oldest first). */
function spells(db: Db, vid: string) {
  const evs = db.connectivity.filter((c) => c.vehicleId === vid).sort((a, b) => a.at.localeCompare(b.at));
  const out: { from: string; to?: string; min: number }[] = [];
  for (const e of evs) {
    if (e.state === "offline") out.push({ from: e.at, min: 0 });
    else if (out.length && !out[out.length - 1].to) {
      const s = out[out.length - 1];
      s.to = e.at;
      s.min = Math.max(0, (Date.parse(e.at) - Date.parse(s.from)) / 60_000);
    }
  }
  return out;
}

/** Connectivity and sync: when each phone was out of signal, and whether what it holds matches the database. */
function SyncTable({ rows, db, now }: { rows: { vid: string; released: boolean; silentMin: number | null }[]; db: Db; now: number }) {
  const shown = rows.filter((r) => r.released || db.driverSync[r.vid]);
  if (!shown.length) return null;
  return (
    <Card className="overflow-x-auto">
      <div className="flex flex-wrap items-baseline gap-2 px-4 pb-2 pt-3">
        <h2 className="font-bold">Connectivity &amp; sync</h2>
        <span className="text-[11px] text-muted">Each phone logs when it loses and finds the server, and checks its records against the database on every sync</span>
      </div>
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
          <tr><th className="px-4 py-2">Vehicle</th><th className="px-2 py-2">Now</th><th className="px-2 py-2">Offline today</th><th className="px-2 py-2">Last sync</th><th className="px-4 py-2">Phone vs database</th></tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const s = db.driverSync[r.vid];
            const c = s?.check;
            const sp = spells(db, r.vid);
            const total = Math.round(sp.reduce((n, x) => n + x.min, 0));
            return (
              <tr key={r.vid} className="border-t border-line align-top">
                <td className="px-4 py-2.5 font-semibold">{r.vid}</td>
                <td className="px-2 py-2.5">
                  {r.silentMin == null ? <Pill>Not synced yet</Pill> : r.silentMin > 2 ? <Pill tone="warning" icon={WifiOff}>Silent {Math.round(r.silentMin)} min</Pill> : <Pill tone="success" dot>Online</Pill>}
                </td>
                <td className="px-2 py-2.5 text-xs text-ink-2">
                  {sp.length ? (
                    <>
                      <b className="text-ink">{sp.length}×, {total} min</b>
                      <ul className="mt-0.5 grid gap-0.5">
                        {sp.slice(-3).reverse().map((x) => (
                          <li key={x.from} className="tabular-nums">{fmtClock(x.from)}–{x.to ? fmtClock(x.to) : "…"}{x.to ? ` · ${Math.round(x.min)} min` : ""}</li>
                        ))}
                      </ul>
                    </>
                  ) : "No drop-outs logged"}
                </td>
                <td className="px-2 py-2.5 text-xs text-ink-2">{s ? `${fmtClock(s.lastSyncAt)} · ${Math.max(0, Math.round((now - Date.parse(s.lastSyncAt)) / 60_000))} min ago` : "—"}</td>
                <td className="px-4 py-2.5">
                  {!c ? <span className="text-xs text-muted">No check yet</span> : (
                    <div className="flex flex-wrap gap-1">
                      {c.missing.length > 0 ? <Pill tone="danger">{c.missing.length} missing · re-sending</Pill> : <Pill tone="success" icon={CheckCircle2}>All {c.phoneSynced} records in the database</Pill>}
                      {c.phoneQueued > 0 && <Pill tone="warning">{c.phoneQueued} waiting on phone</Pill>}
                      {(c.photosQueued ?? 0) > 0 && <Pill tone="info" icon={Camera}>{c.photosQueued} photo{c.photosQueued! > 1 ? "s" : ""} to upload</Pill>}
                      {c.phoneRejected > 0 && <Pill tone="danger">{c.phoneRejected} refused</Pill>}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
