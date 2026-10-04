"use client";
// Pieces shared by the two phone apps (driver and loader): the bottom tab bar, a full-width switch,
// the demo "No signal" card and the sign-out button.
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { LogOut, WifiOff, type LucideIcon } from "lucide-react";
import { Button, Card, cx } from "@/components/ui";
import { setSimulatedOffline, simulatedOffline } from "@/lib/api/network";
import { useOnline } from "@/lib/hooks";
import { signOut } from "@/lib/session";

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
  on: boolean;
  badge?: number;
  /** Red badge (needs action) instead of amber (waiting). */
  alert?: boolean;
}

/** Bottom navigation, fixed to the phone frame. */
export function PhoneTabBar({ label, tabs }: { label: string; tabs: Tab[] }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md border-t border-line bg-surface/95 px-2 pb-[max(env(safe-area-inset-bottom),12px)] pt-2 shadow-[0_-8px_24px_-12px_rgb(12_30_43/0.18)] backdrop-blur" aria-label={label}>
      {tabs.map(({ href, label, icon: Icon, on, badge, alert }) => (
        <Link key={href} href={href} aria-current={on ? "page" : undefined} className={cx("group relative flex flex-1 flex-col items-center gap-1 py-0.5 text-xs", on ? "font-bold text-primary-strong" : "font-medium text-ink-2")}>
          <span className={cx("flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200", on ? "bg-primary-soft" : "group-hover:bg-subtle")}>
            <Icon className="size-[22px]" strokeWidth={on ? 2.4 : 2} />
          </span>
          {label}
          {!!badge && <span className={cx("absolute right-[calc(50%-30px)] -top-0.5 min-w-5 rounded-full border-2 border-surface px-1 text-center text-[10px] font-bold leading-4 text-white", alert ? "bg-danger" : "bg-warning")}>{badge}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** A large on/off row: `warning` for a mode that cuts something off, `primary` for a feature. */
export function SwitchRow({ checked, onChange, icon: Icon, children, tone = "primary" }: { checked: boolean; onChange: (on: boolean) => void; icon: LucideIcon; children: ReactNode; tone?: "primary" | "warning" }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cx(
        "flex items-center justify-between rounded-xl border-2 p-3.5 text-left font-semibold transition-colors",
        !checked ? "border-line hover:border-line-strong" : tone === "warning" ? "border-warning bg-warning-soft text-warning" : "border-primary/40 bg-primary-soft text-primary-strong",
      )}
    >
      <span className="flex items-center gap-2"><Icon className="size-5" /> {children}</span>
      <span className={cx("flex h-7 w-12 items-center rounded-full p-0.5 transition-colors", !checked ? "bg-line-strong" : tone === "warning" ? "bg-warning" : "bg-primary")}>
        <span className={cx("size-6 rounded-full bg-white shadow-card transition-transform duration-200 ease-out", checked && "translate-x-5")} />
      </span>
    </button>
  );
}

/** Demo switch that cuts this tab off from the server, so a dead zone can be shown without devtools. */
export function SimulateOffline({ title, children }: { title: string; children: ReactNode }) {
  const sim = !useOnline() && simulatedOffline();
  return (
    <Card className="grid gap-3 p-4">
      <div>
        <h2 className="font-bold">{title}</h2>
        <p className="text-sm text-ink-2">{children}</p>
      </div>
      <SwitchRow checked={sim} onChange={setSimulatedOffline} icon={WifiOff} tone="warning">No signal</SwitchRow>
    </Card>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      big
      kind="secondary"
      icon={LogOut}
      onClick={async () => {
        await signOut();
        router.replace("/");
      }}
    >
      Sign out
    </Button>
  );
}
