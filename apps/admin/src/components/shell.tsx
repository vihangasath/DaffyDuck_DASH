"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Activity, Building2, ClipboardList, Gauge, IdCard, LogOut, Package, Settings, Store, Truck, Users } from "lucide-react";
import { Logo, Spinner, cx } from "@waypoint/ui/ui";
import { signOut, useAdmin } from "@/lib/session";

const NAV = [
  { group: "Overview", items: [{ href: "/", label: "Overview", icon: Gauge }] },
  {
    group: "Business",
    items: [
      { href: "/drivers", label: "Drivers", icon: IdCard },
      { href: "/vehicles", label: "Vehicles", icon: Truck },
      { href: "/branches", label: "Branches", icon: Store },
      { href: "/depots", label: "Depots", icon: Building2 },
      { href: "/products", label: "Products", icon: Package },
    ],
  },
  {
    group: "Access & records",
    items: [
      { href: "/users", label: "User accounts", icon: Users },
      { href: "/operations", label: "Operations", icon: ClipboardList },
      { href: "/activity", label: "Activity log", icon: Activity },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

/** Admin-only frame: sidebar navigation, signed-in admin, and the guard that sends everyone else to sign in. */
export function AdminShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [user, ready] = useAdmin();
  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);
  if (!user) return <Spinner />;
  const initials = user.name.split(" ").map((w) => w[0]).join("").slice(0, 2);

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="on-ink flex shrink-0 flex-col gap-1 bg-navy px-3 py-3 text-white lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:overflow-y-auto lg:py-5">
        <div className="flex items-center gap-3 px-2 pb-2 lg:pb-5">
          <Logo size={34} label="Waypoint" sub="Admin console" dark />
          <button
            aria-label={`Sign out ${user.name}`}
            onClick={async () => {
              await signOut();
              router.replace("/login");
            }}
            className="ml-auto flex size-9 items-center justify-center rounded-full bg-amber text-xs font-bold text-navy lg:hidden"
          >
            {initials}
          </button>
        </div>
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:flex-col lg:gap-4 lg:overflow-visible" aria-label="Admin">
          {NAV.map((g) => (
            <div key={g.group} className="flex shrink-0 gap-1 lg:grid lg:gap-0.5">
              <div className="hidden px-3 pb-1 text-[11px] font-semibold text-on-ink-muted lg:block">{g.group}</div>
              {g.items.map(({ href, label, icon: Icon }) => {
                const on = href === "/" ? path === "/" : path.startsWith(href);
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
                    <Icon className={cx("size-[18px]", on ? "text-mint" : "text-on-ink-muted group-hover:text-white")} />
                    {label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="mt-auto hidden items-center gap-2.5 px-2 pt-4 lg:flex">
          <span className="flex size-8 items-center justify-center rounded-full bg-amber text-xs font-bold text-navy">{initials}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{user.name}</div>
            <div className="text-[11px] text-on-ink-muted">Administrator</div>
          </div>
          <button
            aria-label="Sign out"
            className="rounded-md p-1.5 text-on-ink-muted transition-colors hover:bg-white/5 hover:text-white"
            onClick={async () => {
              await signOut();
              router.replace("/login");
            }}
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-line bg-surface px-5 py-5 lg:px-7">
      <div className="min-w-0">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-[13px] text-ink-2">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 lg:ml-auto">{actions}</div>}
    </header>
  );
}
