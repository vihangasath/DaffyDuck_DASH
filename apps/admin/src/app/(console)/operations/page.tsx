"use client";
import { useState } from "react";
import { ClipboardList, Snowflake } from "lucide-react";
import type { OrderRow } from "@waypoint/core/admin";
import type { OrderStatus } from "@waypoint/core/views";
import { BrandPill, Pill, type Tone } from "@waypoint/ui/ui";
import { PageHeader } from "@/components/shell";
import { Chips, DataTable, Toolbar, matches, type Column } from "@/components/kit";
import { useAdminQuery } from "@/lib/api";

const STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  confirmed: { label: "Confirmed", tone: "neutral" }, planned: { label: "Planned", tone: "info" }, deferred: { label: "Moved to next run", tone: "danger" },
  loading: { label: "Loading", tone: "info" }, on_the_way: { label: "On the way", tone: "primary" }, arrived: { label: "Driver arrived", tone: "primary" },
  delivered: { label: "Delivered", tone: "success" }, failed: { label: "Not delivered", tone: "danger" }, received: { label: "Received", tone: "success" }, next_run: { label: "Next run", tone: "warning" },
};
const GROUPS: { value: string; label: string; of: OrderStatus[] }[] = [
  { value: "all", label: "All", of: [] },
  { value: "open", label: "Not yet out", of: ["confirmed", "planned", "loading"] },
  { value: "road", label: "On the road", of: ["on_the_way", "arrived"] },
  { value: "done", label: "Delivered", of: ["delivered", "received"] },
  { value: "problem", label: "Deferred or failed", of: ["deferred", "failed", "next_run"] },
];

export default function OperationsPage() {
  const { data, error, isLoading } = useAdminQuery<OrderRow[]>("/orders");
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("all");
  const [depot, setDepot] = useState("all");
  const d = data ?? [];
  const inGroup = (o: OrderRow, g: string) => g === "all" || GROUPS.find((x) => x.value === g)!.of.includes(o.status);
  const rows = data?.filter((o) => matches(q, o.id, o.outletId, o.outletName, o.vehicleId, o.createdBy) && inGroup(o, group) && (depot === "all" || o.depot === depot));
  const columns: Column<OrderRow>[] = [
    { key: "id", header: "Order", sort: (o) => o.id, cell: (o) => <span><b className="block">{o.id}</b><span className="text-xs text-ink-2">{o.source}{o.createdBy && o.source === "Store app" ? ` · ${o.createdBy}` : ""}</span></span> },
    { key: "outlet", header: "Branch", sort: (o) => o.outletName, cell: (o) => <span className="flex items-center gap-2"><BrandPill brand={o.brand} /> {o.outletId} · {o.outletName}</span> },
    { key: "load", header: "Load", align: "right", sort: (o) => o.volumeM3, cell: (o) => <span className="inline-flex items-center gap-1">{o.temp === "chilled" && <Snowflake className="size-3.5 text-chilled" />}{o.units} units · {o.volumeM3.toFixed(1)} m³</span> },
    { key: "vehicle", header: "Vehicle", sort: (o) => o.vehicleId ?? "~", cell: (o) => o.vehicleId ?? "—" },
    { key: "eta", header: "ETA / delivered", sort: (o) => o.deliveredAt ?? o.eta ?? "~", cell: (o) => <span className="tabular-nums">{o.deliveredAt ? `Delivered ${o.deliveredAt}` : o.eta ? `ETA ${o.eta}` : "—"}</span> },
    { key: "status", header: "Status", sort: (o) => o.status, cell: (o) => <Pill tone={STATUS[o.status].tone} dot>{STATUS[o.status].label}</Pill> },
  ];
  return (
    <>
      <PageHeader title="Operations" sub="Every order for the day and where it is right now. Live: it updates as dispatch, the dock and drivers work." />
      <div className="grid gap-4 p-5 lg:p-7">
        <Toolbar q={q} onQ={setQ} placeholder="Search order, branch, vehicle" count={rows ? `${rows.length} shown` : undefined}>
          <Chips value={group} onChange={setGroup} options={GROUPS.map((g) => ({ value: g.value, label: g.label, n: d.filter((o) => inGroup(o, g.value)).length }))} />
          <Chips value={depot} onChange={setDepot} options={[{ value: "all", label: "Both depots" }, { value: "Peliyagoda", label: "Peliyagoda" }, { value: "Kandy", label: "Kandy hub" }]} />
        </Toolbar>
        <DataTable rows={rows} loading={isLoading} error={error?.message} columns={columns} rowKey={(o) => o.id} initialSort={{ key: "id", dir: 1 }} minWidth={900} empty={{ icon: ClipboardList, title: "No orders match" }} />
      </div>
    </>
  );
}
