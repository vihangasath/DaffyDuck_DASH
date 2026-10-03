"use client";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Route, Truck, Upload } from "lucide-react";
import { DriverProvider, useDriver } from "@/components/driver/driver-context";
import { RoleGuard } from "@/components/role-guard";
import { Empty, cx } from "@/components/ui";
import { signOut } from "@/lib/session";
import { useAppTheme, useApplyAppTheme } from "@/lib/app-theme";
import { PhoneTabBar } from "@/components/phone";
import { useKeepPageOffline } from "@/lib/offline/keep-page";

export default function DriverLayout({ children }: LayoutProps<"/driver">) {
  return (
    <RoleGuard role="driver">
      {(s) =>
        !s.vehicleId ? (
          <NoVehicle />
        ) : (
          <DriverProvider vehicleId={s.vehicleId}>
            <DriverLayoutShell>{children}</DriverLayoutShell>
          </DriverProvider>
        )
      }
    </RoleGuard>
  );
}

function DriverLayoutShell({ children }: { children: React.ReactNode }) {
  const { isDark } = useAppTheme("driver");
  useKeepPageOffline();

  useApplyAppTheme(isDark, "driver-dark");

  return (
    <div className={cx("mx-auto flex min-h-dvh max-w-md flex-col bg-canvas shadow-sm transition-colors duration-200", isDark && "driver-dark")}>
      <div className="flex-1 pb-24">{children}</div>
      <BottomNav />
    </div>
  );
}

/** A driver account with no vehicle assigned by dispatch yet. */
function NoVehicle() {
  const router = useRouter();
  const { isDark } = useAppTheme("driver");
  return (
    <div className={cx("mx-auto flex min-h-dvh max-w-md flex-col justify-center bg-canvas transition-colors duration-200", isDark && "driver-dark")}>
      <Empty icon={Truck} title="No vehicle assigned yet">
        <p>Your account isn’t linked to a vehicle today. Ask dispatch to assign one, then sign in again.</p>
        <button
          className="mt-4 font-semibold text-primary"
          onClick={async () => {
            await signOut();
            router.replace("/");
          }}
        >
          Sign out
        </button>
      </Empty>
    </div>
  );
}

function BottomNav() {
  const path = usePathname();
  const { queued, rejected } = useDriver();
  return (
    <PhoneTabBar
      label="Driver"
      tabs={[
        { href: "/driver", label: "Run", icon: Route, on: path === "/driver" || path.startsWith("/driver/stop") },
        { href: "/driver/outbox", label: "Outbox", icon: Upload, on: path === "/driver/outbox", badge: queued + rejected, alert: rejected > 0 },
        { href: "/driver/more", label: "More", icon: Menu, on: path === "/driver/more" },
      ]}
    />
  );
}
