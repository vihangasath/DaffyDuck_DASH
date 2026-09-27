"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { LogOut } from "lucide-react";
import type { PeopleOverview } from "@waypoint/core/people";
import { cx } from "@waypoint/ui/ui";
import { signOut, useAdmin } from "@/lib/session";
import { usePeople } from "@/lib/api";
import { Loading, PeopleMark } from "./cabinet";

const DRAWERS = [
  { href: "/", label: "Front desk" },
  { href: "/staff", label: "Staff directory" },
  { href: "/renewals", label: "Renewals" },
  { href: "/access", label: "Sign-in access" },
  { href: "/activity", label: "Activity log" },
];

/** The cabinet: a rail of drawer fronts with brass label holders. The open drawer is pulled out. */
export function CabinetShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [user, ready] = useAdmin();
  const { data: ov } = usePeople<PeopleOverview>("/overview");
  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);
  if (!user) return <Loading />;

  const overdue = ov?.renewals.filter((r) => r.days < 0).length ?? 0;
  const count: Record<string, { n: number; alert?: boolean } | undefined> = {
    "/staff": ov ? { n: ov.headcount.total - ov.headcount.left } : undefined,
    "/renewals": ov ? { n: ov.renewals.length, alert: overdue > 0 } : undefined,
    "/access": ov?.noLogin.length ? { n: ov.noLogin.length } : undefined,
  };
  const leave = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="flex shrink-0 flex-col bg-cabinet text-on-cabinet lg:sticky lg:top-0 lg:h-dvh lg:w-[248px] lg:overflow-y-auto">
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 lg:px-5 lg:pt-6 lg:pb-6">
          <PeopleMark size={36} />
          <div className="min-w-0 leading-tight">
            <div className="text-[17px] font-bold tracking-[-0.01em] [font-stretch:92%]">Waypoint People</div>
            <div className="caps text-[10px] text-on-cabinet-muted">Human resources</div>
          </div>
          <div className="ml-auto flex items-center gap-1 lg:hidden">
            <Link href="/settings" className="flex h-9 items-center rounded-[3px] px-2 text-xs font-semibold text-on-cabinet-muted hover:bg-cabinet-3 hover:text-on-cabinet">Settings</Link>
            <button aria-label={`Sign out ${user.name}`} onClick={leave} className="flex h-9 items-center gap-1.5 rounded-[3px] px-2 text-xs font-semibold text-on-cabinet-muted hover:bg-cabinet-3 hover:text-on-cabinet">
              <LogOut className="size-4" /> Sign out
            </button>
          </div>
        </div>

        <nav aria-label="Waypoint People" className="flex gap-1.5 overflow-x-auto px-3 pb-3 lg:grid lg:gap-2 lg:overflow-visible lg:px-0 lg:pr-3 lg:pb-0">
          {DRAWERS.map(({ href, label }) => {
            const on = href === "/" ? path === "/" : path.startsWith(href);
            const c = count[href];
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? "page" : undefined}
                className={cx(
                  "group relative flex shrink-0 items-center gap-3 rounded-[3px] px-3 py-2.5 transition-[transform,background-color] duration-300 ease-[var(--ease-out-expo)] lg:rounded-l-none lg:py-3 lg:pl-5",
                  on ? "bg-cabinet-2 shadow-[var(--shadow-drawer),0_6px_14px_-6px_rgb(0_0_0/0.45)] lg:translate-x-2" : "bg-cabinet-3/60 shadow-[var(--shadow-drawer)] hover:bg-cabinet-2/70 lg:hover:translate-x-1",
                )}
              >
                {/* The manila tab of the file you're in, showing above the open drawer. */}
                {on && <span aria-hidden className="absolute -top-1 left-5 hidden h-1.5 w-14 rounded-t-[3px] bg-manila lg:block" />}
                {/* Brass label holder: a brass frame, its lip darker below, with the typed card slid in. */}
                <span className={cx("flex min-w-0 flex-1 rounded-[2px] border-b-2 border-b-brass-ink/60 bg-brass p-[3px] shadow-[0_1px_2px_rgb(0_0_0/0.35)]", on && "bg-brass-2 border-b-brass")}>
                  <span className={cx("flex min-w-0 flex-1 items-center rounded-[1px] px-2 py-0.5", on ? "bg-manila-2 text-manila-ink" : "bg-subtle text-ink/85 group-hover:text-ink")}>
                    <span className="caps truncate text-[11.5px]">{label}</span>
                    {c && <span className={cx("ml-auto pl-2 text-[12px] font-bold tabular-nums", c.alert ? "text-stamp-left" : "text-ink-2")}>{c.n}</span>}
                  </span>
                </span>
                {/* Pull: a brass bar on two posts, casting its shadow on the drawer face. */}
                <span aria-hidden className="hidden h-3 w-7 shrink-0 items-start lg:flex">
                  <span className={cx("h-2 w-full rounded-[3px] border border-brass-ink/50 shadow-[0_3px_3px_-1px_rgb(0_0_0/0.45)]", on ? "bg-brass-2" : "bg-brass")} />
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto hidden gap-3 px-5 pt-6 pb-5 lg:grid">
          <Link href="/settings" aria-current={path.startsWith("/settings") ? "page" : undefined} className={cx("text-sm font-medium hover:text-on-cabinet", path.startsWith("/settings") ? "text-on-cabinet underline" : "text-on-cabinet-muted")}>
            Settings
          </Link>
          <div className="flex items-center gap-2.5 border-t border-white/10 pt-4">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{user.name}</div>
              <div className="text-[11px] text-on-cabinet-muted">HR officer · <span className="font-type">{user.username}</span></div>
            </div>
            <button aria-label="Sign out" className="rounded-[3px] p-2 text-on-cabinet-muted transition-colors hover:bg-cabinet-3 hover:text-on-cabinet" onClick={leave}>
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 pb-12">{children}</main>
    </div>
  );
}
