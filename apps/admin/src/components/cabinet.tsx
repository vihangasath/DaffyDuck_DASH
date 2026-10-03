"use client";
// Waypoint People's building blocks, in the filing-cabinet world: buttons, rubber stamps, job signal tabs,
// index cards, form fields, divider tabs and the ledger table. Every screen is assembled from these.
import { forwardRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Loader2, Search, X, type LucideIcon } from "lucide-react";
import { JOB_LABEL, type JobRole, type StaffRow } from "@waypoint/core/people";
import { cx } from "@waypoint/ui/ui";

// ── Brand ──────────────────────────────────────────────────────────────────────────────────────

/** The People mark: a manila folder carrying the Waypoint navigation emblem. */
export function PeopleMark({ size = 32 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="shrink-0">
      <path d="M6 18a4 4 0 0 1 4-4h14l5 6h25a4 4 0 0 1 4 4v26a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" fill="var(--color-manila)" />
      <path d="M6 27h52" stroke="var(--color-manila-edge)" strokeWidth="2" />
      <g transform="translate(19, 25) scale(0.26)">
        <polygon points="50,0 50,22.8 38.7,44.6 29.4,56.6 39.1,27.8 24.8,30.6" fill="#008289" />
        <polygon points="50,0 50,22.8 61.2,44.6 70.5,56.6 60.8,27.8 75,30.6" fill="#516075" />
        <polygon points="0,37.2 20,45.9 34.2,73.1 32.2,99.4" fill="#008289" />
        <polygon points="100,37.1 79.9,45.9 65.8,73.1 67.6,100" fill="#516075" />
        <polygon points="61.2,44.6 65.8,73.1 67.6,100 51.9,73.1" fill="#3c7e8d" />
        <polygon points="50,31.4 58.8,53.6 32.2,99.4" fill="#102447" />
        <circle cx="50" cy="53.6" r="3.8" fill="#ffffff" />
      </g>
    </svg>
  );
}

// ── Buttons ────────────────────────────────────────────────────────────────────────────────────

type Kind = "primary" | "secondary" | "ghost" | "danger";
const KIND: Record<Kind, string> = {
  primary: "bg-cabinet text-on-cabinet shadow-[inset_0_1px_0_rgb(255_255_255/0.1),inset_0_-2px_0_rgb(0_0_0/0.25)] hover:bg-cabinet-3",
  secondary: "border border-line-strong bg-surface text-ink shadow-card hover:border-ink-2/50 hover:bg-subtle",
  ghost: "text-cabinet hover:bg-well",
  danger: "bg-stamp-left text-white shadow-[inset_0_-2px_0_rgb(0_0_0/0.22)] hover:bg-[#931d17]",
};

/** For links that act as buttons (a Link styled the same way, never a button inside a link). */
export const buttonClass = (kind: Kind = "primary", sm?: boolean) =>
  cx(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-[3px] font-semibold transition-[background-color,border-color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50",
    sm ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
    KIND[kind],
  );

export function Button({ kind = "primary", icon: Icon, sm, busy, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: Kind; icon?: LucideIcon; sm?: boolean; busy?: boolean }) {
  return (
    <button {...rest} disabled={rest.disabled || busy} aria-busy={busy || undefined} className={cx(buttonClass(kind, sm), className)}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : Icon && <Icon className="size-4" />}
      {children}
    </button>
  );
}

// ── Status and job marks ───────────────────────────────────────────────────────────────────────

/** Exceptions only: someone on leave or someone who has left. Active people carry no stamp. */
export function Stamp({ status, className }: { status: StaffRow["status"]; className?: string }) {
  if (status === "active") return null;
  return <span className={cx("stamp text-[11px]", status === "left" ? "text-stamp-left" : "text-stamp-leave", className)}>{status === "left" ? "Left" : "On leave"}</span>;
}

const JOB_COLOR: Record<JobRole, string> = {
  driver: "bg-job-driver",
  loader: "bg-job-loader",
  dispatcher: "bg-job-dispatcher",
  store_manager: "bg-job-store",
  hr_officer: "bg-job-hr",
};
const JOB_TEXT: Record<JobRole, string> = {
  driver: "text-job-driver",
  loader: "text-job-loader",
  dispatcher: "text-job-dispatcher",
  store_manager: "text-job-store",
  hr_officer: "text-job-hr",
};

/** The coloured plastic signal tab a hanging file carries, and the job it stands for. */
export function JobTab({ job, bare, className }: { job: JobRole; bare?: boolean; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5", className)}>
      <span aria-hidden className={cx("h-3.5 w-2.5 shrink-0 rounded-t-[2px] shadow-[inset_0_-1px_0_rgb(0_0_0/0.25)]", JOB_COLOR[job])} />
      {!bare && <span className={cx("caps text-[11px]", JOB_TEXT[job])}>{JOB_LABEL[job]}</span>}
    </span>
  );
}

/** Typed record data: ids, dates, licence numbers. */
export function Typed({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("font-type text-[13px] tracking-tight", className)}>{children}</span>;
}

// ── Cards ──────────────────────────────────────────────────────────────────────────────────────

/** A ruled index card: caps title on the header line above the red rule, content on the feint lines. */
export function IndexCard({ title, aside, children, className, id }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cx("index-card", className)}>
      <header className="flex h-11 items-center gap-2 border-b border-card-red/80 px-4">
        <h3 className="caps text-[12px] text-ink-2">{title}</h3>
        {aside && <div className="ml-auto flex items-center gap-2">{aside}</div>}
      </header>
      <div className="px-4 pt-3 pb-4">{children}</div>
    </section>
  );
}

/** A short list filed in a manila folder: the tab names it, the rows are the papers inside. */
export function FolderList({ title, count, children, className }: { title: string; count?: number; children: ReactNode; className?: string }) {
  return (
    <section className={cx("relative pt-7", className)}>
      <h3 className="absolute top-0 left-4 flex h-8 items-start gap-2 rounded-t-[4px] border border-b-0 border-manila-edge bg-manila px-3 pt-1.5">
        <span className="caps text-[11px] text-manila-ink">{title}</span>
        {count != null && <span className="text-[12px] font-semibold tabular-nums text-manila-ink/80">{count}</span>}
      </h3>
      <div className="relative rounded-[3px] border border-manila-edge bg-manila-2 p-1.5 shadow-card">{children}</div>
    </section>
  );
}

/** A plain sheet on the cabinet ground: white, hairline, low shadow. */
export function Sheet({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx("rounded-[3px] border border-line bg-surface shadow-card", className)}>
      {children}
    </div>
  );
}

// ── Page frame ─────────────────────────────────────────────────────────────────────────────────

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end gap-x-6 gap-y-3 px-5 pt-7 pb-5 lg:px-8 lg:pt-9">
      <div className="min-w-0">
        <h1 className="text-[28px] font-bold leading-[1.1] tracking-[-0.02em] [font-stretch:92%]">{title}</h1>
        {sub && <p className="mt-1.5 max-w-[68ch] text-sm text-ink-2">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 lg:ml-auto">{actions}</div>}
    </header>
  );
}

export function Loading({ rows = 6 }: { rows?: number }) {
  return (
    <div className="grid gap-2 px-5 lg:px-8" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-12 animate-shimmer rounded-[3px] bg-[linear-gradient(90deg,var(--color-well),var(--color-subtle),var(--color-well))] bg-[length:200%_100%]" />
      ))}
    </div>
  );
}

export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-2 px-6 py-12 text-center">
      <Icon className="size-7 text-line-strong" strokeWidth={1.5} />
      <p className="font-semibold">{title}</p>
      {children && <div className="max-w-sm text-sm text-ink-2">{children}</div>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-[3px] border border-stamp-left/30 bg-danger-soft px-4 py-3 text-sm text-danger">
      {children}
    </p>
  );
}

// ── Filters ────────────────────────────────────────────────────────────────────────────────────

export function SearchBox({ q, onQ, placeholder, className }: { q: string; onQ: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <label className={cx("flex h-10 items-center gap-2 rounded-[3px] border border-line-strong bg-surface px-3 shadow-card focus-within:border-cabinet focus-within:outline-2 focus-within:outline-focus", className)}>
      <Search className="size-4 shrink-0 text-muted" />
      <input value={q} onChange={(e) => onQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted" />
      {q && (
        <button type="button" aria-label="Clear search" onClick={() => onQ("")} className="text-muted hover:text-ink">
          <X className="size-4" />
        </button>
      )}
    </label>
  );
}

/** Index dividers: the tabs you file behind. The chosen one stands forward in manila. */
export function Dividers<T extends string>({ value, onChange, options, label, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; n?: number; alert?: boolean }[]; label: string; className?: string }) {
  // Tabs wrap onto a second row rather than hide behind a scroll: every divider stays findable.
  return (
    <div role="radiogroup" aria-label={label} className={cx("-mb-px flex max-w-full min-w-0 flex-wrap gap-x-0.5 gap-y-1 border-b border-line-strong", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              "relative flex shrink-0 items-center gap-1.5 rounded-t-[4px] border border-b-0 px-3 pt-2 pb-1.5 text-[13px] font-semibold whitespace-nowrap transition-[background-color,color,transform]",
              on ? "z-10 translate-y-px border-manila-edge bg-manila text-manila-ink" : "border-transparent bg-well text-ink-2 hover:bg-subtle hover:text-ink",
            )}
          >
            {o.label}
            {o.n != null && (
              <span className={cx("text-[12px] tabular-nums", on ? "text-manila-ink/80" : o.alert && o.n > 0 ? "font-bold text-stamp-left" : "text-muted")}>{o.n}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Ledger table ───────────────────────────────────────────────────────────────────────────────

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  sort?: (row: T) => string | number;
  className?: string;
  align?: "right";
}

export function Ledger<T>({ rows, columns, rowKey, onRowClick, empty, initialSort, minWidth = 760, dim, label }: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (r: T) => string;
  onRowClick?: (r: T) => void;
  empty: { icon: LucideIcon; title: string; body?: ReactNode };
  initialSort?: { key: string; dir: 1 | -1 };
  minWidth?: number;
  dim?: (r: T) => boolean;
  label: string;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const col = sort && columns.find((c) => c.key === sort.key);
  const sorted = col?.sort
    ? [...rows].sort((a, b) => {
        const x = col.sort!(a), y = col.sort!(b);
        return (x < y ? -1 : x > y ? 1 : 0) * sort!.dir;
      })
    : rows;
  return (
    <Sheet className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth }} aria-label={label}>
          <thead className="bg-well text-left text-ink-2">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined} className={cx("caps px-3 py-2.5 text-[11px] first:pl-4 last:pr-4", c.align === "right" && "text-right", c.className)}>
                  {c.sort ? (
                    <button type="button" className={cx("inline-flex items-center gap-1 uppercase hover:text-ink", sort?.key === c.key && "text-ink")} onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 }))}>
                      {c.header}
                      {sort?.key === c.key && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={rowKey(r)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                onKeyDown={onRowClick ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onRowClick(r)) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={cx("border-t border-line align-middle transition-colors", onRowClick && "cursor-pointer hover:bg-manila-2/60 focus-visible:bg-manila-2", dim?.(r) && "text-ink-2")}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cx("px-3 py-2.5 first:pl-4 last:pr-4", c.align === "right" && "text-right tabular-nums", c.className)}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length === 0 && (
        <Empty icon={empty.icon} title={empty.title}>
          {empty.body}
        </Empty>
      )}
    </Sheet>
  );
}

// ── Form fields ────────────────────────────────────────────────────────────────────────────────

const input =
  "h-10 w-full rounded-[3px] border border-line-strong bg-surface px-3 text-sm text-ink transition-[border-color] placeholder:text-muted focus:border-cabinet focus:outline-2 focus:outline-offset-1 focus:outline-focus disabled:border-line disabled:bg-subtle disabled:text-ink-2 aria-invalid:border-stamp-left";

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("grid content-start gap-1 border-b border-feint/80 pb-3", className)}>
      <span className="caps text-[11px] text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { typed?: boolean }>(function TextInput({ typed, className, ...props }, ref) {
  return <input ref={ref} {...props} className={cx(input, typed && "font-type", className)} />;
});

export function Select<T extends string>({ value, onChange, options, placeholder, className, ...rest }: { value: T | "" | null | undefined; onChange: (v: T) => void; options: { value: T; label: string }[]; placeholder?: string; className?: string } & Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  return (
    <span className={cx("relative flex", className?.includes("w-auto") && "inline-flex")}>
      <select {...rest} value={value ?? ""} onChange={(e) => onChange(e.target.value as T)} className={cx(input, "cursor-pointer appearance-none pr-9 disabled:cursor-not-allowed", className)}>
        {placeholder != null && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink-2" />
    </span>
  );
}

/** A two-way rocker, like the switch on a steel cabinet's lamp: the words say which side you're on. */
export function Rocker({ checked, onChange, on, off, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; on: string; off: string; label: string; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("inline-flex rounded-[3px] border border-line-strong bg-well p-0.5", disabled && "opacity-60")}>
      {[true, false].map((v) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={checked === v}
          disabled={disabled}
          onClick={() => onChange(v)}
          className={cx(
            "h-8 rounded-[2px] px-3 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed",
            checked === v ? (v ? "bg-cabinet text-on-cabinet shadow-card" : "bg-stamp-left text-white shadow-card") : "text-ink-2 hover:text-ink",
          )}
        >
          {v ? on : off}
        </button>
      ))}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────────────────────

// Search and "x min ago" are the same as in the logistics app.
export { fmtWhen, matches } from "@waypoint/ui/kit";

/** "20 Oct 2026" from YYYY-MM-DD. */
export const fmtDay = (d: string | null | undefined) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export const todayIso = () => new Date().toISOString().slice(0, 10);
export const daysUntil = (d: string, from = todayIso()) => Math.round((Date.parse(d) - Date.parse(from)) / 86400_000);

/** "in 12 days", "today", "3 days overdue". */
export const dueIn = (days: number) => (days < 0 ? `${-days} day${days === -1 ? "" : "s"} overdue` : days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`);


export const depotLabel = (d: string) => (d === "Kandy" ? "Kandy hub" : "Peliyagoda DC");
