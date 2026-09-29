"use client";
import { Moon, Sun } from "lucide-react";
import { useDriverTheme } from "@/lib/driver-theme";
import { cx } from "@/components/ui";

export function DriverThemeToggle({ className }: { className?: string }) {
  const { isDark, toggle } = useDriverTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cx(
        "flex size-8 shrink-0 items-center justify-center rounded-lg border transition-all duration-150 active:scale-95",
        isDark
          ? "border-white/15 bg-white/10 text-amber hover:bg-white/15"
          : "border-line bg-surface text-ink-2 shadow-card hover:border-line-strong hover:bg-subtle hover:text-ink",
        className,
      )}
    >
      {isDark ? <Sun className="size-4 text-amber" /> : <Moon className="size-4" />}
    </button>
  );
}
