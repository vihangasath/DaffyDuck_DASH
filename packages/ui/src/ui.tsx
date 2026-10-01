"use client";
// UI kit mirroring the Figma "Foundations" page: same tokens, same component vocabulary.
import clsx, { type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import Link from "next/link";
import { ArrowLeft, Check, CloudOff, Loader2, RefreshCw, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

// Later classes win (e.g. <Card className="bg-navy">), including our custom colour tokens.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: ["ink", "ink-2", "muted", "on-ink-muted", "canvas", "surface", "subtle", "navy", "navy-2", "navy-3", "line", "line-strong", "primary", "primary-strong", "primary-soft", "primary-bright", "mint", "amber", "success", "success-soft", "warning", "warning-soft", "danger", "danger-soft", "info", "info-soft", "chilled", "chilled-soft", "neutral", "neutral-soft", "fresh", "fresh-soft", "style", "style-soft", "tech", "tech-soft"],
      shadow: ["card", "raised", "float", "button"],
    },
  },
});
export const cx = (...c: ClassValue[]) => twMerge(clsx(c));

export type Tone = "success" | "warning" | "danger" | "info" | "chilled" | "neutral" | "primary" | "fresh" | "style" | "tech";
const TONE: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  chilled: "bg-chilled-soft text-chilled",
  neutral: "bg-neutral-soft text-neutral",
  primary: "bg-primary-soft text-primary-strong",
  fresh: "bg-fresh-soft text-fresh",
  style: "bg-style-soft text-style",
  tech: "bg-tech-soft text-tech",
};
const SOLID: Record<Tone, string> = {
  success: "bg-success text-on-primary",
  warning: "bg-warning text-white",
  danger: "bg-danger text-white",
  info: "bg-info text-on-primary",
  chilled: "bg-chilled text-on-primary",
  neutral: "bg-neutral text-white",
  primary: "bg-primary text-on-primary",
  fresh: "bg-fresh text-on-primary",
  style: "bg-style text-on-primary",
  tech: "bg-tech text-on-primary",
};
export const DOT: Record<Tone, string> = {
  success: "bg-success", warning: "bg-warning", danger: "bg-danger", info: "bg-info", chilled: "bg-chilled", neutral: "bg-neutral",
  primary: "bg-primary", fresh: "bg-fresh", style: "bg-style", tech: "bg-tech",
};
const TEXT: Record<Tone, string> = {
  success: "text-success", warning: "text-warning", danger: "text-danger", info: "text-info", chilled: "text-chilled", neutral: "text-ink",
  primary: "text-primary-strong", fresh: "text-fresh", style: "text-style", tech: "text-tech",
};

/** The Waypoint emblem: geometric W with directional arrows and central waypoint needle. */
export function WaypointMark({ size = 32, dark }: { size?: number; dark?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="shrink-0">
      <rect width="64" height="64" rx="14" fill={dark ? "var(--color-navy-2)" : "var(--color-navy)"} />
      <g transform="translate(10, 10) scale(0.44)">
        {/* Left arrow half (Teal) */}
        <polygon points="50,0 50,22.8 38.7,44.6 29.4,56.6 39.1,27.8 24.8,30.6" fill="var(--color-primary)" />
        {/* Right arrow half (Slate) */}
        <polygon points="50,0 50,22.8 61.2,44.6 70.5,56.6 60.8,27.8 75,30.6" fill={dark ? "#8ca0b8" : "var(--color-neutral)"} />
        {/* Left wing (Teal) */}
        <polygon points="0,37.2 20,45.9 34.2,73.1 32.2,99.4" fill="var(--color-primary)" />
        {/* Right wing outer facet (Slate) */}
        <polygon points="100,37.1 79.9,45.9 65.8,73.1 67.6,100" fill={dark ? "#8ca0b8" : "var(--color-neutral)"} />
        {/* Right wing inner facet (Mid-Teal) */}
        <polygon points="61.2,44.6 65.8,73.1 67.6,100 51.9,73.1" fill="var(--color-chilled)" />
        {/* Center Needle (White) */}
        <polygon points="50,31.4 58.8,53.6 32.2,99.4" fill="#ffffff" />
        {/* Needle Waypoint Dot */}
        <circle cx="50" cy="53.6" r="3.8" fill="var(--color-navy)" />
      </g>
    </svg>
  );
}

/** The official Waypoint Group mark with optional label and subtitle. */
export function Logo({ size = 32, label, sub, dark }: { size?: number; label?: string; sub?: string; dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <WaypointMark size={size} dark={dark} />
      {label && (
        <span className="min-w-0 leading-tight">
          <span className="block font-bold tracking-tight">{label}</span>
          {sub && <span className={cx("block text-[11px] font-medium", dark ? "text-on-ink-muted" : "text-ink-2")}>{sub}</span>}
        </span>
      )}
    </span>
  );
}

export function Pill({ tone = "neutral", solid, icon: Icon, dot, lg, children, className }: { tone?: Tone; solid?: boolean; icon?: LucideIcon; dot?: boolean; lg?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full font-semibold", lg ? "px-2.5 py-1 text-[13px]" : "px-2 py-0.5 text-[11px]", solid ? SOLID[tone] : TONE[tone], className)}>
      {Icon && <Icon className={lg ? "size-3.5" : "size-3"} strokeWidth={2.25} />}
      {dot && <span className={cx("size-1.5 rounded-full", solid ? "bg-white" : DOT[tone])} />}
      {children}
    </span>
  );
}

export const brandTone = (b: string): Tone => (b === "Fresh" ? "fresh" : b === "Style" ? "style" : "tech");
export const BrandPill = ({ brand }: { brand: string }) => <Pill tone={brandTone(brand)}>{brand}</Pill>;

type BtnKind = "primary" | "secondary" | "ghost" | "danger" | "warn" | "soft" | "dark";
const BTN: Record<BtnKind, string> = {
  primary: "bg-primary text-on-primary shadow-button hover:bg-primary-strong",
  secondary: "bg-surface text-ink border border-line-strong shadow-card hover:border-ink-2/40 hover:bg-canvas",
  ghost: "text-primary hover:bg-primary-soft",
  danger: "bg-danger text-white shadow-button hover:brightness-95",
  warn: "bg-warning text-white shadow-button hover:brightness-95",
  soft: "bg-primary-soft text-primary-strong hover:bg-primary/15",
  dark: "bg-navy text-white shadow-button hover:bg-navy-2",
};
/** Shared by <Button> and link-styled actions so a CTA looks the same whether it navigates or acts. */
export const btnClass = (kind: BtnKind = "primary", size: "big" | "md" | "sm" = "md") =>
  cx(
    "inline-flex select-none items-center justify-center gap-2 font-semibold transition-[background-color,border-color,box-shadow,transform,filter] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:active:translate-y-0",
    size === "big" ? "min-h-14 rounded-xl px-5 text-[17px]" : size === "sm" ? "rounded-lg px-2.5 py-1.5 text-[13px]" : "rounded-lg px-3.5 py-2 text-sm",
    BTN[kind],
  );

export function Button({ kind = "primary", icon: Icon, big, sm, busy, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: BtnKind; icon?: LucideIcon; big?: boolean; sm?: boolean; busy?: boolean }) {
  return (
    <button {...rest} disabled={rest.disabled || busy} aria-busy={busy || undefined} className={cx(btnClass(kind, big ? "big" : sm ? "sm" : "md"), className)}>
      {busy ? <Loader2 className={cx("animate-spin", big ? "size-5" : "size-4")} /> : Icon && <Icon className={big ? "size-5" : "size-4"} />}
      {children}
    </button>
  );
}

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx("rounded-xl border border-line bg-surface shadow-card", className)}>
      {children}
    </div>
  );
}

export function Meter({ pct, tone, className }: { pct: number; tone?: Tone; className?: string }) {
  const t = tone ?? (pct >= 100 ? "danger" : pct > 90 ? "warning" : "primary");
  return (
    <div className={cx("h-2 w-full overflow-hidden rounded-full bg-subtle", className)} role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx("h-full rounded-full transition-[width] duration-500 ease-out", DOT[t])} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
    </div>
  );
}

/**
 * One instrument panel instead of a row of floating KPI cards: cells share a frame and
 * are separated by hairlines, so the eye reads them as one reading of the day.
 */
export function StatStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cx("grid overflow-hidden rounded-xl border border-line bg-line shadow-card [&>*]:bg-surface", "gap-px", className)}>
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, dot, tone, flag, meter, className, children }: { label: string; value: ReactNode; sub?: ReactNode; dot?: Tone; tone?: Tone; flag?: ReactNode; meter?: { pct: number; tone?: Tone }; className?: string; children?: ReactNode }) {
  const alert = tone === "danger";
  return (
    <div className={cx("grid content-start gap-1 p-4", alert && "!bg-danger-soft", className)}>
      <div className="flex min-h-5 items-center gap-2 text-xs font-semibold text-ink-2">
        {dot && <span className={cx("size-2 rounded-full", DOT[dot])} />}
        <span className="truncate">{label}</span>
        {flag && <span className="ml-auto">{flag}</span>}
      </div>
      <div className={cx("text-[28px] font-bold leading-none tracking-tight tabular-nums", tone && TEXT[tone])}>{value}</div>
      {meter && <Meter pct={meter.pct} tone={meter.tone} className="mt-1.5" />}
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
      {children}
    </div>
  );
}

export function Seg<T extends string>({ options, value, onChange, big, fill }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; big?: boolean; fill?: boolean }) {
  return (
    <div className={cx("inline-flex gap-0.5 rounded-[10px] bg-subtle p-[3px]", fill && "flex w-full")} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-lg font-medium transition-[background-color,color,box-shadow] duration-150",
            big ? "px-3 py-2.5 text-[15px]" : "px-2.5 py-1.5 text-xs",
            fill && "flex-1",
            o.value === value ? "bg-surface font-semibold text-ink shadow-card ring-1 ring-line" : "text-ink-2 hover:bg-surface/60 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Kv({ k, v, big }: { k: string; v: ReactNode; big?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{k}</div>
      <div className={cx("font-semibold tabular-nums", big ? "text-lg" : "text-sm")}>{v}</div>
    </div>
  );
}

export function Stepper({ value, max, onChange, tone, big }: { value: number; max?: number; onChange: (v: number) => void; tone?: "warning"; big?: boolean }) {
  const s = big ? "size-12 text-xl" : "size-9 text-lg";
  const btn = cx(s, "flex items-center justify-center rounded-[9px] font-semibold text-primary transition-colors hover:bg-primary-soft active:bg-primary/15 disabled:text-ink-2 disabled:opacity-30 disabled:hover:bg-transparent");
  return (
    <div className={cx("inline-flex items-center rounded-[10px] border bg-surface p-px", tone === "warning" ? "border-warning bg-warning-soft/40" : value > 0 ? "border-primary/50" : "border-line-strong")}>
      <button aria-label="Decrease" className={btn} disabled={value <= 0} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className={cx("min-w-12 text-center font-bold tabular-nums", big ? "text-base" : "text-sm", value === 0 && "text-muted")}>
        {value}
        {max != null && <span className="font-medium text-muted">/{max}</span>}
      </span>
      <button aria-label="Increase" className={btn} disabled={max != null && value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

export function IconBubble({ icon: Icon, tone = "primary", size = 16 }: { icon: LucideIcon; tone?: Tone; size?: number }) {
  return (
    <span className={cx("inline-flex shrink-0 items-center justify-center rounded-lg p-1.5", TONE[tone])}>
      <Icon style={{ width: size, height: size }} />
    </span>
  );
}

export function SyncPill({ state, queued = 0 }: { state: "ok" | "sync" | "off"; queued?: number }) {
  if (state === "off")
    return (
      <Pill tone="warning" icon={CloudOff} lg>
        Offline{queued ? ` · ${queued} queued` : ""}
      </Pill>
    );
  if (state === "sync")
    return (
      <Pill tone="info" icon={RefreshCw} lg>
        Syncing{queued ? ` ${queued}` : ""}…
      </Pill>
    );
  return (
    <Pill tone="success" icon={Check} lg>
      Synced
    </Pill>
  );
}

/** Mobile app bar (driver, loader, store phone). `progress` (0–1) draws a route rail under the bar. */
export function AppBar({ title, sub, back, right, dark, progress }: { title: ReactNode; sub?: ReactNode; back?: string; right?: ReactNode; dark?: boolean; progress?: number }) {
  return (
    <header className={cx("sticky top-0 z-20", dark ? "on-ink bg-navy text-white" : "border-b border-line bg-surface/95 backdrop-blur")}>
      <div className="flex items-center gap-3 px-4 pb-3 pt-3">
        {back && (
          <Link href={back} aria-label="Back" className={cx("-ml-1.5 flex size-10 items-center justify-center rounded-xl transition-colors", dark ? "hover:bg-white/10" : "hover:bg-subtle")}>
            <ArrowLeft className="size-6" />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[19px] font-bold leading-tight tracking-tight">{title}</h1>
          {sub && <p className={cx("truncate text-[13px]", dark ? "text-on-ink-muted" : "text-ink-2")}>{sub}</p>}
        </div>
        {right}
      </div>
      {progress != null && (
        <div className={cx("h-1", dark ? "bg-navy-2" : "bg-subtle")} role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Run progress">
          <div className="h-full bg-mint transition-[width] duration-700 ease-out" style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
        </div>
      )}
    </header>
  );
}

export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="relative flex size-16 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Icon className="size-7" />
        <span className="absolute -right-1 -top-1 size-3.5 rounded-full border-[3px] border-canvas bg-mint" />
      </span>
      <p className="text-lg font-bold tracking-tight">{title}</p>
      {children && <div className="max-w-sm text-sm leading-relaxed text-ink-2">{children}</div>}
    </div>
  );
}

const shimmer = "animate-shimmer rounded-xl bg-[linear-gradient(90deg,var(--color-subtle)_0%,var(--color-canvas)_50%,var(--color-subtle)_100%)] bg-[length:200%_100%]";
/** Loading placeholder shaped like a page (header, a strip, content), not a spinner in a void. */
export function Spinner() {
  return (
    <div className="grid gap-4 p-5 lg:p-7" role="status" aria-label="Loading">
      <div className={cx(shimmer, "h-8 w-56")} />
      <div className={cx(shimmer, "h-24")} />
      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <div className={cx(shimmer, "h-64")} />
        <div className={cx(shimmer, "h-64")} />
      </div>
    </div>
  );
}
