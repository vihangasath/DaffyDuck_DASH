"use client";
import { ClipboardList, KeyRound, LogIn, Settings2, Truck, UserCog } from "lucide-react";
import type { ActivityRow } from "@waypoint/core/admin";
import { cx } from "@waypoint/ui/ui";

const ROLE_TONE: Record<string, string> = {
  admin: "bg-navy text-mint", dispatcher: "bg-primary-soft text-primary-strong", loader: "bg-warning-soft text-warning",
  driver: "bg-info-soft text-info", store: "bg-style-soft text-style", system: "bg-subtle text-ink-2",
};

const ICONS = { login: LogIn, key: KeyRound, user: UserCog, vehicle: Truck, ops: ClipboardList, admin: Settings2 };
const iconOf = (a: ActivityRow): keyof typeof ICONS =>
  a.action.startsWith("auth.login") ? "login" : a.action.startsWith("auth.") || a.action === "user.password" ? "key" : a.action.startsWith("user.") ? "user" : a.action.startsWith("ops.sync") || a.entity === "vehicle" ? "vehicle" : a.action.startsWith("ops.") ? "ops" : "admin";

function ActivityIcon({ kind }: { kind: keyof typeof ICONS }) {
  const Icon = ICONS[kind];
  return <Icon className="size-4" />;
}

/** One line of the audit trail: who (and in which role), what, when. */
export function ActivityItem({ a, when }: { a: ActivityRow; when: string }) {
  return (
    <li className="flex gap-3 border-b border-line px-4 py-3 last:border-0">
      <span className={cx("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", ROLE_TONE[a.role] ?? ROLE_TONE.system)}>
        <ActivityIcon kind={iconOf(a)} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug">{a.summary}</p>
        <p className="mt-0.5 text-xs text-ink-2">
          <b className="font-semibold text-ink">{a.actor}</b> · {a.role} · <time dateTime={a.at} title={new Date(a.at).toLocaleString("en-GB")}>{when}</time>
        </p>
      </div>
    </li>
  );
}
