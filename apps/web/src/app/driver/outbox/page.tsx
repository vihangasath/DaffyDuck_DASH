"use client";
import { AlertTriangle, Check, ClipboardCheck, Clock, MapPin, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useDriver } from "@/components/driver/driver-context";
import { DriverSync } from "@/components/driver/bits";
import { AppBar, Button, Card, Pill, cx } from "@/components/ui";
import { outletName } from "@waypoint/core/reference";
import type { OutboxRow } from "@/lib/offline/outbox";

const ICON = { arrived: MapPin, delivered: ClipboardCheck, problem: AlertTriangle };

export default function Outbox() {
  const d = useDriver();
  const queued = d.rows.filter((r) => r.status === "queued");
  const synced = d.rows.filter((r) => r.status === "synced").reverse();
  const refused = d.rows.filter((r) => r.status === "rejected").reverse();
  return (
    <>
      <AppBar title="Outbox" sub="Records saved on this phone" right={<DriverSync />} />
      <div className="grid gap-3 p-4">
        {d.online ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-info/20 bg-info-soft p-3.5 text-sm font-semibold text-info">
            <Wifi className="size-5" /> {queued.length ? "Connected · sending automatically" : "Connected · everything is synced"}
          </div>
        ) : (
          <div className="flex items-center gap-2.5 rounded-xl border border-warning/30 bg-warning-soft p-3.5 text-sm font-semibold text-warning">
            <WifiOff className="size-5" /> No signal · records wait here until you’re back in coverage
          </div>
        )}
        {refused.length > 0 && (
          <div className="grid gap-3 rounded-xl border border-danger/30 bg-danger-soft p-3.5">
            <p className="flex items-start gap-2.5 text-sm font-semibold text-danger">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" />
              Dispatch didn’t accept {refused.length === 1 ? "this record" : `these ${refused.length} records`}. Nothing was deleted: call dispatch to sort it out.
            </p>
            <Group title={`Not accepted · ${refused.length}`} rows={refused} empty="" />
          </div>
        )}
        <Group title={`Waiting · ${queued.length}`} rows={queued} empty="Nothing waiting to send." />
        <Group title={`Synced · ${synced.length}`} rows={synced.slice(0, 20)} empty="No records yet today." />
        <p className="text-xs text-muted">Each record carries its own ID, so a retry can never create a duplicate. Times shown are when it happened, not when it synced.</p>
        <Button big kind="secondary" icon={RefreshCw} busy={d.syncing} disabled={!d.online} onClick={() => d.flush()}>
          Sync now
        </Button>
      </div>
    </>
  );
}

function Group({ title, rows, empty }: { title: string; rows: OutboxRow[]; empty: string }) {
  const { trips } = useDriver();
  return (
    <Card className="overflow-hidden">
      <h2 className="border-b border-line px-3.5 py-3 text-sm font-bold">{title}</h2>
      {rows.length === 0 && <p className="px-3.5 py-3 text-sm text-ink-2">{empty}</p>}
      {rows.map((r) => {
        const e = r.event;
        const Icon = ICON[e.kind];
        const label = e.kind === "arrived" ? "Arrival" : e.kind === "delivered" ? "Proof of delivery" : "Issue report";
        const meta =
          e.kind === "delivered"
            ? `${e.at} · ${e.pod.photos} photo${e.pod.photos === 1 ? "" : "s"} · ${e.pod.signed ? "signed" : "unsigned"}${e.pod.lines.some((l) => l.delivered < l.planned) ? " · shortage" : ""}`
            : e.kind === "problem"
              ? `${e.at} · ${e.problem.reason}`
              : e.at;
        return (
          <div key={r.id} className="flex items-center gap-3 border-t border-line px-3.5 py-3 first-of-type:border-0">
            <span className={cx("flex size-9 shrink-0 items-center justify-center rounded-lg", e.kind === "problem" ? "bg-danger-soft text-danger" : e.kind === "delivered" ? "bg-primary-soft text-primary" : "bg-subtle text-ink-2")}><Icon className="size-[18px]" /></span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{label} · {outletName(orderOutlet(e.orderId, trips))}</div>
              <div className="truncate text-xs text-ink-2">{meta}</div>
              {r.status === "rejected" && <div className="text-xs font-semibold text-danger">{r.rejectedReason}</div>}
            </div>
            {r.status === "queued" ? <Pill tone="warning" icon={Clock}>Queued</Pill> : r.status === "rejected" ? <Pill tone="danger" icon={AlertTriangle}>Not accepted</Pill> : <Pill tone="success" icon={Check}>Synced</Pill>}
          </div>
        );
      })}
    </Card>
  );
}

const orderOutlet = (orderId: string, trips: ReturnType<typeof useDriver>["trips"]) =>
  trips.flatMap((t) => t.orders).find((o) => o.id === orderId)?.outletId ?? orderId;
