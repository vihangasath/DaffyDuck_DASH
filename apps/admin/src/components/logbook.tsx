"use client";
import type { PeopleActivity } from "@waypoint/core/people";
import { cx } from "@waypoint/ui/ui";
import { Typed } from "./cabinet";

const ROLE: Record<string, string> = { hr: "HR", admin: "HR", dispatcher: "Dispatch", loader: "Loader", driver: "Driver", store: "Store", system: "System" };

const KIND = (a: PeopleActivity) =>
  a.action.startsWith("auth.") ? { label: "Sign-in", cls: "text-ink-2" }
  : a.action === "user.password" ? { label: "Password", cls: "text-brass-ink" }
  : a.action.startsWith("user.") ? { label: "Access", cls: "text-manila-ink" }
  : { label: "Record", cls: "text-cabinet" };

const stamp = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
};

/** Entries written before the HR split still name the old product. */
const summaryOf = (a: PeopleActivity) => a.summary.replace("the admin console", "Waypoint People");

/** Folds back-to-back identical entries (same person, same words) into one line with a count. */
export function collapse(rows: PeopleActivity[]): { a: PeopleActivity; times: number }[] {
  const out: { a: PeopleActivity; times: number }[] = [];
  for (const a of rows) {
    const last = out[out.length - 1];
    if (last && last.a.actor === a.actor && last.a.summary === a.summary && last.a.action === a.action) last.times++;
    else out.push({ a, times: 1 });
  }
  return out;
}

/** One ruled line of the logbook: when, what kind, what happened, who. */
export function LogLine({ a, times = 1 }: { a: PeopleActivity; times?: number }) {
  const k = KIND(a);
  return (
    <li className="grid grid-cols-[3.75rem_1fr] gap-x-3 border-b border-feint px-4 py-2.5 last:border-0 sm:grid-cols-[3.75rem_4.5rem_1fr]">
      <time dateTime={a.at} title={new Date(a.at).toLocaleString("en-GB")} className="pt-px">
        <Typed className="text-ink-2">{stamp(a.at)}</Typed>
      </time>
      <span className={cx("caps hidden pt-0.5 text-[10.5px] sm:block", k.cls)}>{k.label}</span>
      <div className="min-w-0">
        <p className="text-sm leading-snug">
          {summaryOf(a)}
          {times > 1 && <span className="ml-1.5 text-xs font-semibold text-ink-2">×{times}</span>}
        </p>
        <p className="mt-0.5 text-xs text-ink-2">
          {a.actor} · {ROLE[a.role] ?? a.role}
        </p>
      </div>
    </li>
  );
}
