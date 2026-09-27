"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Activity, BarChart3, Building2, CalendarDays, History, LayoutGrid, LogOut, Package, RotateCcw, Route, Store, Truck, Warehouse } from "lucide-react";
import type { Depot } from "@waypoint/core/domain/types";
import { DEMO_DATE } from "@waypoint/core/reference";
import { fmtDate } from "@waypoint/core/domain/time";
import { useDb } from "@/lib/hooks";
import { signOut as endSession, type Session } from "@/lib/session";
import { Logo, cx } from "./ui";

export const useDepot = create<{ depot: Depot; set: (d: Depot) => void }>()(
  persist((set) => ({ depot: "Peliyagoda", set: (depot) => set({ depot }) }), { name: "waypoint-dispatch-depot" }),
);

const NAV = [
  {
    group: "Today’s run",
    items: [
      { href: "/dispatcher", label: "Today", icon: LayoutGrid },
      { href: "/dispatcher/plan", label: "Plan & allocate", icon: Route },
      { href: "/dispatcher/live", label: "Live tracking", icon: Activity },
      { href: "/dispatcher/deferrals", label: "Deferrals", icon: History },
      { href: "/dispatcher/capacity", label: "Capacity outlook", icon: BarChart3 },
      { href: "/dispatcher/fleet", label: "Fleet & fuel", icon: Truck },
    ],
  },
  {
    group: "Network records",
    items: [
      { href: "/dispatcher/records/vehicles", label: "Vehicles", icon: Warehouse },
      { href: "/dispatcher/records/branches", label: "Branches", icon: Store },
      { href: "/dispatcher/records/depots", label: "Depots", icon: Building2 },
      { href: "/dispatcher/records/products", label: "Products", icon: Package },
      { href: "/dispatcher/records/demo", label: "Demo day", icon: RotateCcw },
    ],
  },
];

export function DispatcherShell({ session, children }: { session: Session; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { depot, set } = useDepot();
  const { data: db } = useDb();
  const deferred = db?.plans[depot]?.deferred.length ?? 0;
  const exceptions = db?.exceptions.filter((e) => e.depot === depot && !e.resolved).length ?? 0;
  const badge: Record<string, number> = { "/dispatcher/plan": deferred, "/dispatcher/live": exceptions };
  const signOut = async () => {
    await endSession();
    router.replace("/");
  };
  const initials = session.name.split(" ").map((w) => w[0]).join("");

  const depotSwitch = (
    <div className="flex gap-1 rounded-lg bg-navy p-1" role="radiogroup" aria-label="Depot">
      {(["Peliyagoda", "Kandy"] as Depot[]).map((d) => (
        <button
          key={d}
          role="radio"
          aria-checked={d === depot}
          onClick={() => set(d)}
          className={cx("flex-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors", d === depot ? "bg-white text-navy shadow-card" : "text-on-ink-muted hover:bg-white/5 hover:text-white")}
        >
          {d === "Kandy" ? "Kandy hub" : d}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="on-ink flex shrink-0 flex-col gap-1 bg-navy px-3 py-3 text-white lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:overflow-y-auto lg:py-5">
        <div className="flex items-center gap-3 px-2 pb-2 lg:pb-6">
          <Logo size={34} label="Waypoint" sub="Dispatch console" dark />
          {/* Compact controls for tablet/phone: the desktop footer below is hidden there. */}
          <div className="ml-auto flex items-center gap-2 lg:hidden">
            {depotSwitch}
            <button aria-label={`Sign out ${session.name}`} onClick={signOut} className="flex size-9 items-center justify-center rounded-full bg-amber text-xs font-bold text-navy">
              {initials}
            </button>
          </div>
        </div>
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:flex-col lg:gap-4 lg:overflow-visible lg:pb-0" aria-label="Dispatcher">
          {NAV.map((g) => (
            <div key={g.group} className="flex shrink-0 gap-1 lg:grid lg:gap-0.5">
              <div className="hidden px-3 pb-1 text-[11px] font-semibold text-on-ink-muted lg:block">{g.group}</div>
              {g.items.map(({ href, label, icon: Icon }) => {
                const on = href === "/dispatcher" ? path === href : path.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={on ? "page" : undefined}
                    className={cx(
                      "group flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                      on ? "bg-navy-2 font-semibold text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]" : "font-medium text-on-ink-muted hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <Icon className={cx("size-[18px] transition-colors", on ? "text-mint" : "text-on-ink-muted group-hover:text-white")} />
                    {label}
                    {!!badge[href] && (
                      <span className={cx("ml-auto min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold leading-5 text-white", href.endsWith("live") ? "bg-danger" : "bg-warning")}>{badge[href]}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="mt-auto hidden flex-col gap-3 lg:flex">
          <div className="grid gap-2 rounded-xl bg-navy-2 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-on-ink-muted">
              <CalendarDays className="size-3.5" /> Planning for {fmtDate(DEMO_DATE, { weekday: "short", day: "numeric", month: "short" })}
            </div>
            {depotSwitch}
          </div>
          <div className="flex items-center gap-2.5 px-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-amber text-xs font-bold text-navy">{initials}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{session.name}</div>
              <div className="text-[11px] text-on-ink-muted">Dispatcher</div>
            </div>
            <button aria-label="Sign out" className="rounded-md p-1.5 text-on-ink-muted transition-colors hover:bg-white/5 hover:text-white" onClick={signOut}>
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

export function PageHeader({ title, sub, chips, actions }: { title: string; sub?: ReactNode; chips?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-line bg-surface px-5 py-5 lg:px-7">
      <div className="min-w-0">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-[13px] text-ink-2">{sub}</p>}
      </div>
      {chips && <div className="flex flex-wrap items-center gap-1.5">{chips}</div>}
      {actions && <div className="flex flex-wrap items-center gap-2 lg:ml-auto">{actions}</div>}
    </header>
  );
}
