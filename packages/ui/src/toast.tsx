"use client";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { create } from "zustand";

interface Toast {
  id: number;
  kind: "success" | "error";
  text: string;
}
const useToasts = create<{ items: Toast[] }>(() => ({ items: [] }));
let n = 0;
function push(kind: Toast["kind"], text: string) {
  const id = ++n;
  useToasts.setState((s) => ({ items: [...s.items, { id, kind, text }] }));
  setTimeout(() => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) })), kind === "error" ? 6000 : 3000);
}
export const toast = { success: (t: string) => push("success", t), error: (t: string) => push("error", t) };

export function Toaster() {
  const items = useToasts((s) => s.items);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : undefined}
          className={`pointer-events-auto flex max-w-md animate-rise items-start gap-2.5 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-float ${t.kind === "success" ? "bg-navy" : "bg-danger"}`}
        >
          {t.kind === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-mint" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
          {t.text}
        </div>
      ))}
    </div>
  );
}
