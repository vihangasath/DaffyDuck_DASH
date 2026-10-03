"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Bell, Box, ChevronRight, Snowflake, Truck } from "lucide-react";
import { Empty, Meter, Pill, Seg, Spinner, btnClass, cx, type Tone } from "@/components/ui";
import { LoaderSync } from "@/components/loader/bits";
import { ThemeToggle } from "@/components/theme-controls";
import { useLoader } from "@/components/loader/loader-context";
import { useSession } from "@/lib/session";
import { fmtMin, fmtClock } from "@waypoint/core/domain/time";
import { dockTrips, LOAD_LABEL } from "@waypoint/core/loading";
import { outletName } from "@waypoint/core/reference";

const TONE: Record<string, Tone> = { not_started: "neutral", loading: "info", held: "danger", released: "success" };
const SEEN = "waypoint-loader-seen-version";

export default function DockQueue() {
  const { db, fromCache, savedAt } = useLoader();
  const [session] = useSession();
  const [wave, setWave] = useState<"fresh" | "day">("fresh");
  const [seen, setSeen] = useState(() => {
    try {
      return typeof window === "undefined" ? 0 : Number(localStorage.getItem(SEEN) ?? 0);
    } catch {
      return 0;
    }
  });
  const depot = session?.depot ?? "Peliyagoda";
  const trips = useMemo(() => (db ? dockTrips(db, depot, seen) : []), [db, depot, seen]);
  if (!db) return <Spinner />;
  const plan = db.plans[depot];

  const fresh = trips.filter((t) => t.te.trip.brand === "Fresh");
  const day = trips.filter((t) => t.te.trip.brand !== "Fresh");
  const shown = wave === "fresh" ? fresh : day;
  const changed = trips.filter((t) => t.changed);
  const next = trips.find((t) => t.load.status !== "released");
  const released = trips.filter((t) => t.load.status === "released").length;

  return (
    <>
      <header className="on-ink sticky top-0 z-20 bg-navy px-4 pb-4 pt-[max(env(safe-area-inset-top),14px)] text-white">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-bold leading-tight tracking-tight">{depot} dock</h1>
            <p className="truncate text-[13px] text-on-ink-muted">{session?.name} · {plan?.status === "published" ? `plan v${plan.version} · ${released}/${trips.length} released` : "waiting for tonight’s plan"}</p>
          </div>
          <ThemeToggle app="loader" />
          <LoaderSync />
        </div>
        {next && (
          <Link href={`/loader/${next.te.trip.id}`} className="mt-3 flex items-center gap-3 rounded-xl bg-white/10 p-3 transition-colors hover:bg-white/15">
            <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg bg-mint text-navy">
              <span className="text-[8px] font-bold tracking-[0.14em]">BAY</span>
              <span className="text-lg font-bold leading-none tabular-nums">{next.bay}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-mint">Next to leave · {fmtMin(next.te.depart)}</span>
              <span className="block truncate font-bold">{next.te.vehicle.id} · {next.loaded}/{next.planned} loaded</span>
            </span>
            <ChevronRight className="size-5 text-on-ink-muted" />
          </Link>
        )}
      </header>

      {fromCache && savedAt && (
        <p className="bg-warning-soft px-4 py-2 text-[13px] font-semibold text-warning">
          No connection · showing the dock as of {fmtClock(savedAt)}. Ticks are kept on this phone.
        </p>
      )}

      {!plan || plan.status !== "published" ? (
        <Empty icon={Box} title="No published plan yet">
          Load lists appear here as soon as dispatch publishes tonight’s plan. They update live if the plan changes — no printed sheets.
        </Empty>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 p-4">
          {changed.length > 0 && (
            <div className="grid gap-2 rounded-xl border border-info bg-info-soft p-3.5">
              <p className="flex items-center gap-2 font-bold"><Bell className="size-5 text-info" /> Plan v{plan.version} changed {changed.length} load list{changed.length > 1 ? "s" : ""}</p>
              <p className="text-sm text-ink-2">{changed.map((t) => `${t.te.vehicle.id} trip ${t.te.trip.tripNo}`).join(" · ")}. Printed lists are out of date; use this screen.</p>
              <button
                className={cx(btnClass("secondary"), "justify-self-start")}
                onClick={() => {
                  setSeen(plan.version);
                  try {
                    localStorage.setItem(SEEN, String(plan.version));
                  } catch {}
                }}
              >
                Got it
              </button>
            </div>
          )}
          <Seg big fill value={wave} onChange={setWave} options={[
              { value: "fresh", label: <WaveLabel name="Fresh" time="03:30" n={fresh.length} /> },
              { value: "day", label: <WaveLabel name="Style & Tech" time="08:00" n={day.length} /> },
            ]} />
          {shown.length === 0 && <p className="p-6 text-center text-ink-2">No trips in this wave.</p>}
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-2.5">
            {shown.map((t) => {
              const v = t.te.vehicle;
              const pct = (t.loaded / t.planned) * 100;
              return (
                <li key={t.te.trip.id}>
                  <Link href={`/loader/${t.te.trip.id}`} aria-label={`${v.id} trip ${t.te.trip.tripNo}, bay ${t.bay}`} className={cx("grid grid-cols-[minmax(0,1fr)] gap-2.5 rounded-2xl bg-surface p-3.5 shadow-card ring-1 transition-[box-shadow,transform] duration-150 active:scale-[0.99]", t.load.status === "held" ? "ring-2 ring-danger/50" : t.changed ? "ring-2 ring-warning/50" : "ring-line")}>
                    <div className="flex items-center gap-3">
                      <span className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-navy [.dark_&]:bg-navy-3 text-white">
                        <span className="text-[8px] font-bold tracking-[0.14em] text-on-ink-muted">BAY</span>
                        <span className="text-xl font-bold leading-none tabular-nums">{t.bay}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-lg font-bold tracking-tight">
                          {v.id}
                          {v.temp === "reefer" ? <Snowflake className="size-4 text-chilled" aria-label="Refrigerated" /> : <Truck className="size-4 text-muted" aria-label="Dry-box" />}
                        </span>
                        <span className="block truncate text-xs font-semibold text-ink-2">Departs {fmtMin(t.te.depart)} · {t.te.trip.district}{t.te.trip.tripNo > 1 ? " · trip 2" : ""}</span>
                      </div>
                      <Pill tone={t.changed ? "warning" : TONE[t.load.status]} dot className="self-start">{t.changed ? "Changed" : LOAD_LABEL[t.load.status]}</Pill>
                    </div>
                    <div className="flex items-center gap-2">
                      <Meter pct={pct} tone={t.load.status === "held" ? "danger" : pct >= 100 ? "success" : "primary"} className="h-2.5 min-w-0 flex-1" />
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-2">{t.loaded}/{t.planned}</span>
                    </div>
                    <p className={cx("truncate text-xs font-semibold", t.load.status === "held" ? "text-danger" : "text-muted")}>
                      {t.load.status === "held" ? "Waiting for dispatcher" : `${t.te.stops.length} stops · first ${outletName(t.te.stops[0].outletId)}`}
                      {t.shortfalls ? ` · ${t.shortfalls} flagged` : ""}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

function WaveLabel({ name, time, n }: { name: string; time: string; n: number }) {
  return (
    <span className="grid justify-items-center gap-0.5 leading-tight">
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        {name}
        <span className="min-w-6 rounded-full bg-navy [.dark_&]:bg-navy-3 px-1.5 text-center text-xs font-bold leading-5 text-white">{n}</span>
      </span>
      <span className="text-xs font-medium text-ink-2">from {time}</span>
    </span>
  );
}
