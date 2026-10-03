"use client";
import { usePathname } from "next/navigation";
import { AlertTriangle, LayoutList, Menu } from "lucide-react";
import { LoaderProvider, useLoader } from "@/components/loader/loader-context";
import { RoleGuard } from "@/components/role-guard";
import { cx } from "@/components/ui";
import { useKeepPageOffline } from "@/lib/offline/keep-page";
import { useAppTheme, useApplyAppTheme } from "@/lib/app-theme";
import { PhoneTabBar } from "@/components/phone";

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
  return (
    <PhoneTabBar
      label="Loader"
      tabs={[
        { href: "/loader", label: "Queue", icon: LayoutList, on: path === "/loader", badge: queued + rejected.length, alert: rejected.length > 0 },
        { href: "/loader/flags", label: "Flags", icon: AlertTriangle, on: path === "/loader/flags", badge: waiting, alert: true },
        { href: "/loader/more", label: "More", icon: Menu, on: path === "/loader/more" },
      ]}
    />
  );
}
