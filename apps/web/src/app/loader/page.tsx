"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Bell, Box, Snowflake, Truck } from "lucide-react";
import { Card, Empty, Meter, Pill, Seg, Spinner, btnClass, cx, type Tone } from "@/components/ui";
import { useDb } from "@/lib/hooks";
import { fmtMin } from "@waypoint/core/domain/time";
import { dockTrips, LOAD_LABEL } from "@waypoint/core/loading";
import { useSession } from "@/lib/session";
import { outletName } from "@waypoint/core/reference";

const TONE: Record<string, Tone> = { not_started: "neutral", loading: "info", held: "danger", released: "success" };
const SEEN = "waypoint-loader-seen-version";

export default function DockQueue() {
  const { data: db } = useDb();
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
  if (!plan || plan.status !== "published")
    return (
      <Empty icon={Box} title="No published plan yet">
        Load lists appear here as soon as dispatch publishes tonight’s plan. They update live if the plan changes — no printed sheets.
      </Empty>
    );

  const fresh = trips.filter((t) => t.te.trip.brand === "Fresh");
  const day = trips.filter((t) => t.te.trip.brand !== "Fresh");
  const shown = wave === "fresh" ? fresh : day;
  const changed = trips.filter((t) => t.changed);

  return (
    <div className="grid gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">Dock queue</h1>
        <p className="text-sm text-ink-2">Plan v{plan.version} · {trips.length} trips · load in reverse stop order</p>
      </div>
      {changed.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-info bg-info-soft p-4">
          <Bell className="size-6 text-info" />
          <div className="min-w-0 flex-1">
            <p className="font-bold">Plan v{plan.version} changed {changed.length} load list{changed.length > 1 ? "s" : ""}</p>
            <p className="text-sm text-ink-2">{changed.map((t) => `${t.te.vehicle.id} trip ${t.te.trip.tripNo}`).join(" · ")} — printed lists are out of date; use this screen.</p>
          </div>
          <button
            className={btnClass("secondary")}
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
          { value: "fresh", label: <WaveLabel name="Fresh wave" time="03:30" n={fresh.length} /> },
          { value: "day", label: <WaveLabel name="Style & Tech" time="08:00" n={day.length} /> },
        ]} />
      {shown.length === 0 && <p className="p-6 text-center text-ink-2">No trips in this wave.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((t) => {
          const v = t.te.vehicle;
          const pct = (t.loaded / t.planned) * 100;
          return (
            <Link key={t.te.trip.id} href={`/loader/${t.te.trip.id}`} className="block">
              <Card className={cx("grid h-full gap-3 p-4 transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-raised", t.load.status === "held" ? "border-danger/60 ring-2 ring-danger/20" : t.changed ? "border-warning/60 ring-2 ring-warning/20" : "hover:border-primary/40")}>
                <div className="flex items-center gap-3">
                  <span className="flex size-14 shrink-0 flex-col items-center justify-center rounded-xl bg-navy text-white">
                    <span className="text-[9px] font-bold tracking-[0.14em] text-on-ink-muted">BAY</span>
                    <span className="text-2xl font-bold leading-none tabular-nums">{t.bay}</span>
                  </span>
                  <div className="min-w-0">
                    <span className="block text-xl font-bold tracking-tight">{v.id}</span>
                    <span className="block text-xs font-semibold text-ink-2">Departs {fmtMin(t.te.depart)}</span>
                  </div>
                  <Pill tone={t.changed ? "warning" : TONE[t.load.status]} dot className="ml-auto self-start">
                    {t.changed ? "Plan changed" : LOAD_LABEL[t.load.status]}
                  </Pill>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Pill tone={v.temp === "reefer" ? "chilled" : "neutral"} icon={v.temp === "reefer" ? Snowflake : Truck}>
                    {v.temp === "reefer" ? "Reefer" : "Dry-box"} {v.type}
                  </Pill>
                  <Pill>Trip {t.te.trip.tripNo} · {t.te.trip.brand} · {t.te.trip.district}</Pill>
                </div>
                <p className="truncate text-sm text-ink-2">{t.te.stops.length} stops · first {outletName(t.te.stops[0].outletId)}</p>
                <div className="flex items-center gap-2">
                  <Meter pct={pct} tone={t.load.status === "held" ? "danger" : pct >= 100 ? "success" : "primary"} className="h-2.5" />
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-2">{t.loaded} / {t.planned}</span>
                </div>
                <p className={cx("text-xs font-semibold", t.load.status === "held" ? "text-danger" : "text-muted")}>
                  {t.load.status === "held" ? "Waiting for dispatcher" : pct >= 100 ? "Fully loaded" : `${Math.round(pct)}% loaded`}
                  {t.shortfalls ? ` · ${t.shortfalls} shortfall flagged` : ""}
                </p>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function WaveLabel({ name, time, n }: { name: string; time: string; n: number }) {
  return (
    <span className="grid justify-items-center gap-0.5 leading-tight">
      <span className="flex items-center gap-1.5">
        {name}
        <span className="min-w-6 rounded-full bg-navy px-1.5 text-center text-xs font-bold leading-5 text-white">{n}</span>
      </span>
      <span className="text-xs font-medium text-ink-2">departs {time}</span>
    </span>
  );
}
