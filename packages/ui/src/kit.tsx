"use client";
// Record-keeping building blocks in the Waypoint operations system: a searchable data table, a side drawer
// for editing, and form fields. The dispatcher's network records (vehicles, branches…) are assembled from these.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import { Button, Card, Empty, Spinner, cx } from "./ui";
import type { LucideIcon } from "lucide-react";

// ── Table ──────────────────────────────────────────────────────────────────────────────────────

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Enables sorting on this column. */
  sort?: (row: T) => string | number;
  className?: string;
  align?: "right";
}

export function DataTable<T>({
  rows, columns, rowKey, onRowClick, empty, loading, error, initialSort, minWidth = 760, dim,
}: {
  rows: T[] | undefined;
  columns: Column<T>[];
  rowKey: (r: T) => string;
  onRowClick?: (r: T) => void;
  empty: { icon: LucideIcon; title: string; body?: ReactNode };
  loading?: boolean;
  error?: string | null;
  initialSort?: { key: string; dir: 1 | -1 };
  minWidth?: number;
  /** Rows shown quieter (inactive, retired…). */
  dim?: (r: T) => boolean;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  if (error) return <Card className="p-6 text-sm text-danger">{error}</Card>;
  if (loading || !rows) return <Spinner />;
  const col = sort && columns.find((c) => c.key === sort.key);
  const sorted = col?.sort
    ? [...rows].sort((a, b) => {
        const x = col.sort!(a), y = col.sort!(b);
        return (x < y ? -1 : x > y ? 1 : 0) * sort!.dir;
      })
    : rows;
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth }}>
          <thead className="bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cx("px-3 py-2.5 first:pl-4 last:pr-4", c.align === "right" && "text-right", c.className)}>
                  {c.sort ? (
                    <button
                      className={cx("inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink", sort?.key === c.key && "text-ink")}
                      onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 }))}
                    >
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
                className={cx("border-t border-line align-middle transition-colors", onRowClick && "cursor-pointer hover:bg-canvas focus-visible:bg-primary-soft/50", dim?.(r) && "text-ink-2 [&_td]:opacity-70")}
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
    </Card>
  );
}

/** Search box + filter chips above a table. */
export function Toolbar({ q, onQ, placeholder, children, count }: { q: string; onQ: (v: string) => void; placeholder: string; children?: ReactNode; count?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex min-w-60 flex-1 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2 shadow-card focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15 sm:max-w-80">
        <Search className="size-4 text-muted" />
        <input value={q} onChange={(e) => onQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="w-full bg-transparent text-sm outline-none placeholder:text-muted" />
        {q && (
          <button aria-label="Clear search" onClick={() => onQ("")} className="text-muted hover:text-ink">
            <X className="size-4" />
          </button>
        )}
      </label>
      {children}
      {count && <span className="ml-auto text-xs font-medium text-ink-2">{count}</span>}
    </div>
  );
}

export function Chips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; n?: number }[] }) {
  return (
    <div className="flex flex-wrap gap-1" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
            o.value === value ? "border-navy bg-navy text-white" : "border-line-strong bg-surface text-ink-2 hover:border-ink-2/40 hover:text-ink",
          )}
        >
          {o.label}
          {o.n != null && <span className={cx("ml-1.5 tabular-nums", o.value === value ? "text-on-ink-muted" : "text-muted")}>{o.n}</span>}
        </button>
      ))}
    </div>
  );
}

export const matches = (q: string, ...fields: (string | null | undefined)[]) => !q || fields.some((f) => f?.toLowerCase().includes(q.toLowerCase()));

// ── Drawer ─────────────────────────────────────────────────────────────────────────────────────

/** Right-hand panel for creating or editing a record. Esc closes it; focus moves into it on open. */
export function Drawer({ open, title, sub, onClose, children, footer }: { open: boolean; title: string; sub?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("keydown", esc);
      prev?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 animate-[fade_0.2s_ease-out] bg-navy/30 backdrop-blur-[1px]" />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} className="relative flex h-full w-full max-w-lg animate-[slide-in_0.28s_var(--ease-out-expo)] flex-col bg-canvas shadow-float">
        <header className="flex items-start gap-3 border-b border-line bg-surface px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={id} className="text-lg font-bold tracking-tight">{title}</h2>
            {sub && <div className="mt-0.5 text-[13px] text-ink-2">{sub}</div>}
          </div>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-ink-2 hover:bg-subtle hover:text-ink">
            <X className="size-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <footer className="flex flex-wrap items-center gap-2 border-t border-line bg-surface px-5 py-3.5">{footer}</footer>}
      </div>
    </div>
  );
}

// ── Form fields ────────────────────────────────────────────────────────────────────────────────

const input =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink shadow-card transition-[border-color,box-shadow] placeholder:text-muted focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 disabled:bg-subtle disabled:text-ink-2";

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("grid content-start gap-1.5", className)}>
      <span className="text-[13px] font-semibold text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(input, props.className)} />;
}

/**
 * While focused, the field shows what the user typed; the parent only ever receives a finite number or null.
 * Half-typed entries ("1.", "-", "1e") read back as "" from a number input, and must not reset the field.
 */
export function NumberInput({ value, onChange, onFocus, onBlur, step = "any", ...rest }: { value: number | null | undefined; onChange: (v: number | null) => void; step?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const text = value != null && Number.isFinite(value) ? String(value) : "";
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      {...rest}
      type="number"
      inputMode="decimal"
      step={step}
      value={draft ?? text}
      onFocus={(e) => {
        setDraft(text);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setDraft(null);
        onBlur?.(e);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        if (e.target.validity.badInput) return; // mid-entry: wait for a complete number
        if (raw.trim() === "") return onChange(null);
        const n = Number(raw);
        if (Number.isFinite(n)) onChange(n);
      }}
      className={cx(input, "tabular-nums", rest.className)}
    />
  );
}

export function Select<T extends string>({ value, onChange, options, placeholder, ...rest }: { value: T | "" | null | undefined; onChange: (v: T) => void; options: { value: T; label: string }[]; placeholder?: string } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  return (
    <select {...rest} value={value ?? ""} onChange={(e) => onChange(e.target.value as T)} className={cx(input, "appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%234a5868%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9", rest.className)}>
      {placeholder != null && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-4 rounded-xl border border-line bg-surface p-3.5 text-left shadow-card">
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        {sub && <span className="block text-xs text-ink-2">{sub}</span>}
      </span>
      <span className={cx("flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors", checked ? "bg-primary" : "bg-line-strong")}>
        <span className={cx("size-5 rounded-full bg-white shadow-card transition-transform duration-200", checked && "translate-x-5")} />
      </span>
    </button>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="grid gap-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-bold">{title}</h3>
        {aside && <span className="ml-auto">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

export function SaveBar({ onCancel, busy, label = "Save changes", disabled }: { onCancel: () => void; busy?: boolean; label?: string; disabled?: boolean }) {
  return (
    <>
      <Button type="submit" form="drawer-form" busy={busy} disabled={disabled}>
        {label}
      </Button>
      <Button type="button" kind="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </>
  );
}

export const fmtWhen = (iso: string | null | undefined) => {
  if (!iso) return "Never";
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
};
