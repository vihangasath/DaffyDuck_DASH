"use client";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, Snowflake } from "lucide-react";
import { AppBar, Empty, Pill, Spinner, cx, type Tone } from "@/components/ui";
import { LoaderSync } from "@/components/loader/bits";
import { useLoader } from "@/components/loader/loader-context";
import type { Shortfall } from "@/lib/api";
import { outletName } from "@waypoint/core/reference";

// Everything flagged on this dock today and what dispatch decided, so the loader knows what to re-pick.
const STATE = (s: Shortfall): { rank: number; label: string; tone: Tone; note: string } =>
  s.resolution === "repick" ? { rank: 0, label: "Re-pick", tone: "danger", note: "Dispatch asked for a re-pick: load the balance, then release." }
  : !s.resolution && s.decision === "hold" ? { rank: 1, label: "Waiting for dispatch", tone: "warning", note: "Vehicle held at the dock until dispatch decides." }
  : s.resolution === "tomorrow" ? { rank: 2, label: "Balance tomorrow", tone: "info", note: "Released short; the balance goes on the next run." }
  : { rank: 3, label: "Released short", tone: "neutral", note: "Store told what to expect." };

const KIND: Record<Shortfall["kind"], string> = { missing: "Missing", damaged: "Damaged", wrong_item: "Wrong item" };

export default function Flags() {
  const { db } = useLoader();
  if (!db) return <Spinner />;
  const rows = db.shortfalls.map((s) => ({ s, st: STATE(s) })).sort((a, b) => a.st.rank - b.st.rank || b.s.at.localeCompare(a.s.at));
  return (
    <>
      <AppBar title="Flags" sub={`${rows.length} flagged today · what needs you first`} right={<LoaderSync />} />
      {!rows.length ? (
        <Empty icon={CheckCircle2} title="Nothing flagged">Shortfalls and damage you flag from a load list show up here with the dispatcher’s decision.</Empty>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-2.5 p-4">
          {rows.map(({ s, st }) => {
            const chilled = db.orders.find((o) => o.id === s.orderId)?.temp === "chilled";
            return (
              <li key={s.id}>
                <Link href={`/loader/${s.tripId}`} className={cx("grid grid-cols-[minmax(0,1fr)] gap-1.5 rounded-2xl bg-surface p-3.5 shadow-card ring-1", st.rank === 0 ? "ring-2 ring-danger/50" : st.rank === 1 ? "ring-2 ring-warning/50" : "ring-line")}>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className={cx("size-4 shrink-0", st.rank <= 1 ? "text-danger" : "text-muted")} />
                    <b className="min-w-0 flex-1 truncate">{s.vehicleId} · {s.name}</b>
                    <Pill tone={st.tone} dot={st.rank > 1} solid={st.rank === 0}>{st.label}</Pill>
                  </div>
                  <p className="flex items-center gap-1.5 text-sm text-ink-2">
                    {chilled && <Snowflake className="size-3.5 text-chilled" />}
                    {KIND[s.kind]} · {s.loaded} of {s.planned} loaded · {outletName(s.outletId)}
                  </p>
                  <p className="flex items-center text-xs text-muted">
                    <span className="flex-1">{st.note}{s.resolvedBy ? ` (${s.resolvedBy})` : ""}</span>
                    <ChevronRight className="size-4" />
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
