"use client";
import { Laptop, Moon, Sun } from "lucide-react";
import { Card, cx } from "@/components/ui";
import { useAppTheme, type ThemeApp } from "@/lib/app-theme";

/** Sun/moon button for a phone app's header. */
export function ThemeToggle({ app, className }: { app: ThemeApp; className?: string }) {
  const { isDark, toggle } = useAppTheme(app);
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cx(
        "flex size-8 shrink-0 items-center justify-center rounded-lg border transition-all duration-150 active:scale-95",
        isDark ? "border-white/15 bg-white/10 text-amber hover:bg-white/15" : "border-line bg-surface text-ink-2 shadow-card hover:border-line-strong hover:bg-subtle hover:text-ink",
        className,
      )}
    >
      {isDark ? <Sun className="size-4 text-amber" /> : <Moon className="size-4" />}
    </button>
  );
}

/** Dark / Light / System picker for a phone app's More screen. */
export function ThemePicker({ app, why }: { app: ThemeApp; why: string }) {
  const { mode, setMode } = useAppTheme(app);
  return (
    <Card className="grid gap-3 p-4">
      <div>
        <h2 className="font-bold">Dark mode</h2>
        <p className="text-sm text-ink-2">{why}</p>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-subtle p-1" role="radiogroup" aria-label="Theme mode">
        {(["dark", "light", "system"] as const).map((m) => (
          <button
            key={m}
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={cx(
              "flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold capitalize transition-all",
              mode === m ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-ink-2 hover:text-ink",
            )}
          >
            {m === "dark" ? <Moon className="size-3.5" /> : m === "light" ? <Sun className="size-3.5" /> : <Laptop className="size-3.5" />}
            {m}
          </button>
        ))}
      </div>
    </Card>
  );
}
