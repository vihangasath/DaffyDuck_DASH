"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Route, Truck, Upload } from "lucide-react";
import { DriverProvider, useDriver } from "@/components/driver/driver-context";
import { RoleGuard } from "@/components/role-guard";
import { Empty, cx } from "@/components/ui";
import { signOut } from "@/lib/session";

export default function DriverLayout({ children }: LayoutProps<"/driver">) {
  return (
    <RoleGuard role="driver">
      {(s) =>
        !s.vehicleId ? (
          <NoVehicle />
        ) : (
        <DriverProvider vehicleId={s.vehicleId}>
          <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-canvas shadow-sm">
            <div className="flex-1 pb-24">{children}</div>
            <BottomNav />
          </div>
        </DriverProvider>
        )
      }
    </RoleGuard>
  );
}

/** A driver account with no vehicle assigned by dispatch yet. */
function NoVehicle() {
  const router = useRouter();
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center bg-canvas">
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
  const { queued } = useDriver();
  const items = [
    { href: "/driver", label: "Run", icon: Route, on: path === "/driver" || path.startsWith("/driver/stop") },
    { href: "/driver/outbox", label: "Outbox", icon: Upload, on: path === "/driver/outbox", badge: queued },
    { href: "/driver/more", label: "More", icon: Menu, on: path === "/driver/more" },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md border-t border-line bg-surface/95 px-2 pb-[max(env(safe-area-inset-bottom),12px)] pt-2 shadow-[0_-8px_24px_-12px_rgb(12_30_43/0.18)] backdrop-blur" aria-label="Driver">
      {items.map(({ href, label, icon: Icon, on, badge }) => (
        <Link key={href} href={href} aria-current={on ? "page" : undefined} className={cx("group relative flex flex-1 flex-col items-center gap-1 py-0.5 text-xs", on ? "font-bold text-primary-strong" : "font-medium text-ink-2")}>
          <span className={cx("flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200", on ? "bg-primary-soft" : "group-hover:bg-subtle")}>
            <Icon className="size-[22px]" strokeWidth={on ? 2.4 : 2} />
          </span>
          {label}
          {!!badge && <span className="absolute right-[calc(50%-30px)] -top-0.5 min-w-5 rounded-full border-2 border-surface bg-warning px-1 text-center text-[10px] font-bold leading-4 text-white">{badge}</span>}
        </Link>
      ))}
    </nav>
  );
}
