"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, LayoutList, Menu } from "lucide-react";
import { LoaderProvider, useLoader } from "@/components/loader/loader-context";
import { RoleGuard } from "@/components/role-guard";
import { cx } from "@/components/ui";
import { useKeepPageOffline } from "@/lib/offline/keep-page";
import { useAppTheme, useApplyAppTheme } from "@/lib/app-theme";

// The loader's phone app: same shape as the driver app (phone-width frame, bottom tabs, installable,
// keeps ticking with no dock Wi-Fi, dark mode). It also works on a desktop browser, framed at phone width.
export default function LoaderLayout({ children }: LayoutProps<"/loader">) {
  return (
    <RoleGuard role="loader">
      {(s) => (
        <LoaderProvider depot={s.depot ?? "Peliyagoda"}>
          <Shell>{children}</Shell>
        </LoaderProvider>
      )}
    </RoleGuard>
  );
}

const TABS = ["/loader", "/loader/flags", "/loader/more"];

function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { isDark } = useAppTheme("loader");
  useKeepPageOffline();
  useApplyAppTheme(isDark, "dark");
  // A load list is a task screen: its Flag / Release bar takes the place of the tabs.
  const tabs = TABS.includes(path);
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-canvas shadow-sm transition-colors duration-200">
      <div className={cx("flex-1", tabs ? "pb-24" : "pb-36")}>{children}</div>
      {tabs && <BottomNav path={path} />}
    </div>
  );
}

function BottomNav({ path }: { path: string }) {
  const { db, queued, rejected } = useLoader();
  const waiting = db?.shortfalls.filter((s) => !s.resolution && s.decision === "hold").length ?? 0;
  const items = [
    { href: "/loader", label: "Queue", icon: LayoutList, badge: queued + rejected.length, alert: rejected.length > 0 },
    { href: "/loader/flags", label: "Flags", icon: AlertTriangle, badge: waiting, alert: true },
    { href: "/loader/more", label: "More", icon: Menu, badge: 0, alert: false },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md border-t border-line bg-surface/95 px-2 pb-[max(env(safe-area-inset-bottom),12px)] pt-2 shadow-[0_-8px_24px_-12px_rgb(12_30_43/0.18)] backdrop-blur" aria-label="Loader">
      {items.map(({ href, label, icon: Icon, badge, alert }) => {
        const on = path === href;
        return (
          <Link key={href} href={href} aria-current={on ? "page" : undefined} className={cx("group relative flex flex-1 flex-col items-center gap-1 py-0.5 text-xs", on ? "font-bold text-primary-strong" : "font-medium text-ink-2")}>
            <span className={cx("flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200", on ? "bg-primary-soft" : "group-hover:bg-subtle")}>
              <Icon className="size-[22px]" strokeWidth={on ? 2.4 : 2} />
            </span>
            {label}
            {!!badge && <span className={cx("absolute right-[calc(50%-30px)] -top-0.5 min-w-5 rounded-full border-2 border-surface px-1 text-center text-[10px] font-bold leading-4 text-white", alert ? "bg-danger" : "bg-warning")}>{badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
