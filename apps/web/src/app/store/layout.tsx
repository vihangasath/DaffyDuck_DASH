"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Store } from "lucide-react";
import { RoleGuard } from "@/components/role-guard";
import { cx } from "@/components/ui";
import { DashLogo as Logo } from "@/components/logo";
import { net, outletName } from "@waypoint/core/reference";
import { useDb } from "@/lib/hooks";
import { signOut, type Session } from "@/lib/session";

export default function StoreLayout({ children }: LayoutProps<"/store">) {
  return <RoleGuard role="store">{(s) => <Shell s={s}>{children}</Shell>}</RoleGuard>;
}

function Shell({ s, children }: { s: Session; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { data: db } = useDb();
  const outletId = s.outletId!;
  const o = net.outlets.get(outletId)!;
  const unread = db?.notices.filter((n) => n.outletId === outletId && (n.kind === "deferral" || n.kind === "late") && !n.acknowledged).length ?? 0;
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2.5 px-4 py-3 sm:px-7">
          <Link href="/store" className="flex items-center transition-opacity hover:opacity-90">
            <Logo
              width={96}
              label="DASH Stores"
              className="gap-3"
              imageClassName="w-[72px] sm:w-[96px] h-auto"
              labelClassName="text-base sm:text-lg font-bold tracking-tight text-ink"
            />
          </Link>
          <span className="flex items-center gap-2 rounded-lg bg-subtle px-3 py-2 text-sm font-semibold">
            <Store className="size-4 text-primary" /> {outletId} · {o.brand} {outletName(outletId)}
          </span>
          <nav className="flex gap-1 rounded-[10px] bg-subtle p-[3px]" aria-label="Store">
            {[
              { href: "/store", label: "Deliveries", badge: unread },
              { href: "/store/order", label: "New order" },
            ].map((n) => {
              const on = n.href === "/store" ? path === "/store" || path.startsWith("/store/receipt") : path.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className={cx("relative flex items-center rounded-lg px-3 py-1.5 text-sm transition-[background-color,color,box-shadow]", on ? "bg-surface font-semibold text-ink shadow-card ring-1 ring-line" : "font-medium text-ink-2 hover:text-ink")}>
                  {n.label}
                  {!!n.badge && <span className="ml-1.5 min-w-5 rounded-full bg-danger px-1.5 text-center text-[11px] font-bold leading-5 text-white">{n.badge}</span>}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2.5">
            <span className="hidden text-right leading-tight sm:block">
              <span className="block text-sm font-semibold">{s.name}</span>
              <span className="block text-[11px] text-ink-2">Store manager · {o.brand}</span>
            </span>
            <button
              aria-label="Sign out"
              className="flex size-9 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-subtle hover:text-ink"
              onClick={async () => {
                await signOut();
                router.replace("/");
              }}
            >
              <LogOut className="size-[18px]" />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl">{children}</main>
    </div>
  );
}
