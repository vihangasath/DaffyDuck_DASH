"use client";
import { CloudOff, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { Button, SyncPill } from "@/components/ui";
import { useNow } from "@/lib/hooks";
import { useDriver } from "./driver-context";
import { DriverThemeToggle } from "./theme-toggle";

export function DriverSync() {
  const d = useDriver();
  return (
    <div className="flex items-center gap-2">
      <DriverThemeToggle />
      <Link href="/driver/outbox" aria-label="Sync status">
        <SyncPill state={!d.online ? "off" : d.syncing || d.queued ? "sync" : "ok"} queued={d.queued} />
      </Link>
    </div>
  );
}

/** Calm, unmissable offline banner: explains the state and that nothing is lost. */
export function OfflineBanner() {
  const d = useDriver();
  const now = useNow(30_000);
  if (d.online) return null;
  const mins = d.lastSyncAt ? Math.max(0, Math.round((now - Date.parse(d.lastSyncAt)) / 60000)) : null;
  return (
    <div role="status" className="flex items-start gap-3 border-b border-warning bg-warning-soft px-4 py-3">
      <CloudOff className="mt-0.5 size-5 shrink-0 text-warning" />
      <div className="text-[13px]">
        <p className="text-[15px] font-bold text-warning">No signal{mins != null ? ` · last synced ${mins ? `${mins} min ago` : "just now"}` : ""}</p>
        <p>Keep working — everything is saved on this phone{d.queued ? ` (${d.queued} waiting)` : ""} and syncs when you’re back in coverage.</p>
      </div>
    </div>
  );
}

export function RunChangeBanner() {
  const d = useDriver();
  if (!d.change) return null;
  return (
    <div className="m-4 grid gap-2 rounded-xl border-2 border-warning bg-surface p-4">
      <div className="flex items-center gap-2 font-bold">
        <RefreshCw className="size-5 text-warning" /> Your run was changed by dispatch
      </div>
      {d.change.removed.length > 0 && <p className="text-sm">Removed: {d.change.removed.map((id) => <b key={id}>{id} </b>)}</p>}
      {d.change.added.length > 0 && <p className="text-sm">Added: {d.change.added.map((id) => <b key={id}>{id} </b>)}</p>}
      <p className="text-xs text-ink-2">Anything you already recorded keeps its original time.</p>
      <Button big icon={X} onClick={d.ackChange}>OK, update my run</Button>
    </div>
  );
}
