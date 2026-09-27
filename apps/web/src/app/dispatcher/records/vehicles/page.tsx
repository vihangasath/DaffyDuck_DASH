"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Plus, Snowflake, Truck, Wrench } from "lucide-react";
import type { NetworkLookups, VehicleRow } from "@waypoint/core/records";
import { Button, Meter, Pill } from "@waypoint/ui/ui";
import { PageHeader } from "@/components/dispatcher-shell";
import { Chips, DataTable, Drawer, Field, NumberInput, SaveBar, Select, TextInput, Toggle, Toolbar, matches, type Column } from "@waypoint/ui/kit";
import { records, useRecords, useRecordsMutation } from "@/lib/records";

type Draft = Omit<VehicleRow, "id" | "drivers" | "tripsToday" | "fuelUsedWeekL"> & { driverId: string | null };
const BLANK: Draft = { plateNo: "", type: "truck", temp: "ambient", weightCapKg: 3000, volumeCapM3: 18, fuelType: "diesel", kmPerL: 7, weeklyFuelQuotaL: 350, depotId: "Peliyagoda", status: "available", active: true, driverId: null };

export default function VehiclesPage() {
  return (
    <Suspense>
      <Vehicles />
    </Suspense>
  );
}

function Vehicles() {
  const params = useSearchParams();
  const { data, error, isLoading } = useRecords<VehicleRow[]>("/vehicles");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState(params.get("filter") ?? "all");
  const [editing, setEditing] = useState<VehicleRow | "new" | null>(null);
  const d = data ?? [];
  const rows = data?.filter(
    (v) =>
      matches(q, v.id, v.plateNo, ...v.drivers.map((x) => x.name)) &&
      (filter === "all" || (filter === "workshop" ? v.active && v.status === "in_workshop" : filter === "reefer" ? v.temp === "reefer" : filter === "van" ? v.type === "van" : filter === "retired" ? !v.active : v.depotId === filter)),
  );

  const columns: Column<VehicleRow>[] = [
    {
      key: "id", header: "Vehicle", sort: (v) => v.id,
      cell: (v) => (
        <span className="flex items-center gap-2.5">
          <span className={v.temp === "reefer" ? "flex size-8 items-center justify-center rounded-lg bg-chilled-soft text-chilled" : "flex size-8 items-center justify-center rounded-lg bg-subtle text-ink-2"}>
            {v.temp === "reefer" ? <Snowflake className="size-4" /> : <Truck className="size-4" />}
          </span>
          <span><b className="block">{v.id}</b><span className="text-xs text-ink-2">{v.plateNo ?? "No plate"}</span></span>
        </span>
      ),
    },
    { key: "kind", header: "Type", sort: (v) => v.temp + v.type, cell: (v) => `${v.temp === "reefer" ? "Refrigerated" : "Dry-box"} ${v.type}` },
    { key: "cap", header: "Capacity", align: "right", sort: (v) => v.volumeCapM3, cell: (v) => <span>{v.volumeCapM3} m³ <span className="text-ink-2">· {v.weightCapKg.toLocaleString()} kg</span></span> },
    { key: "depot", header: "Depot", sort: (v) => v.depotId, cell: (v) => (v.depotId === "Kandy" ? "Kandy hub" : "Peliyagoda") },
    { key: "drivers", header: "Drivers", cell: (v) => (v.drivers.length ? v.drivers.map((x) => x.name).join(", ") : <span className="text-muted">None</span>) },
    {
      key: "fuel", header: "Fuel this week", sort: (v) => v.fuelUsedWeekL / v.weeklyFuelQuotaL,
      cell: (v) => {
        const pct = (v.fuelUsedWeekL / v.weeklyFuelQuotaL) * 100;
        return <span className="flex items-center gap-2"><Meter pct={pct} className="w-20" /><span className="text-xs tabular-nums text-ink-2">{Math.round(pct)}%</span></span>;
      },
    },
    { key: "today", header: "Trips today", align: "right", sort: (v) => v.tripsToday, cell: (v) => v.tripsToday || "—" },
    {
      key: "status", header: "Status", sort: (v) => (v.active ? v.status : "zz"),
      cell: (v) => (!v.active ? <Pill>Retired</Pill> : v.status === "available" ? <Pill tone="success" dot>Available</Pill> : <Pill tone="danger" icon={Wrench}>Workshop</Pill>),
    },
  ];

  return (
    <>
      <PageHeader title="Vehicles" sub="The fleet the planner allocates: capacities, refrigeration, fuel quotas and which driver runs each vehicle." actions={<Button icon={Plus} onClick={() => setEditing("new")}>Add vehicle</Button>} />
      <div className="grid gap-4 p-5 lg:p-7">
        <Toolbar q={q} onQ={setQ} placeholder="Search id, plate or driver" count={rows ? `${rows.length} shown` : undefined}>
          <Chips
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", n: d.length },
              { value: "Peliyagoda", label: "Peliyagoda", n: d.filter((v) => v.depotId === "Peliyagoda").length },
              { value: "Kandy", label: "Kandy hub", n: d.filter((v) => v.depotId === "Kandy").length },
              { value: "reefer", label: "Refrigerated", n: d.filter((v) => v.temp === "reefer").length },
              { value: "van", label: "Vans", n: d.filter((v) => v.type === "van").length },
              { value: "workshop", label: "In workshop", n: d.filter((v) => v.active && v.status === "in_workshop").length },
              { value: "retired", label: "Retired", n: d.filter((v) => !v.active).length },
            ]}
          />
        </Toolbar>
        <DataTable rows={rows} loading={isLoading} error={error?.message} columns={columns} rowKey={(v) => v.id} onRowClick={setEditing} dim={(v) => !v.active} initialSort={{ key: "id", dir: 1 }} minWidth={980} empty={{ icon: Truck, title: "No vehicles match" }} />
      </div>
      {editing && <VehicleDrawer key={editing === "new" ? "new" : editing.id} vehicle={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function VehicleDrawer({ vehicle, onClose }: { vehicle: VehicleRow | null; onClose: () => void }) {
  const [v, setV] = useState<Draft>(vehicle ? { ...vehicle, driverId: vehicle.drivers[0]?.id ?? null } : BLANK);
  const { data: look } = useRecords<NetworkLookups>("/lookups");
  const drivers = (look?.drivers ?? []).filter((d) => d.depot === v.depotId);
  const set = <K extends keyof Draft>(k: K, val: Draft[K]) => setV((x) => ({ ...x, [k]: val }));
  const save = useRecordsMutation(
    (x: Draft) => (vehicle ? records(`/vehicles/${vehicle.id}`, { method: "PATCH", body: { ...x, plateNo: x.plateNo || null } }) : records<{ id: string }>("/vehicles", { body: { ...x, plateNo: x.plateNo || null } })),
    (r) => (vehicle ? `${vehicle.id} updated` : `${(r as { id: string }).id} added to the fleet`),
  );
  const locked = !!vehicle?.tripsToday;
  return (
    <Drawer
      open
      onClose={onClose}
      title={vehicle ? `${vehicle.id}${vehicle.plateNo ? ` · ${vehicle.plateNo}` : ""}` : "Add a vehicle"}
      sub={vehicle ? (locked ? `${vehicle.tripsToday} trip${vehicle.tripsToday > 1 ? "s" : ""} in today’s plan: its depot, type and refrigeration are locked until they’re moved.` : "Not in today’s plan.") : "The planner can use it from the next plan run."}
      footer={<SaveBar onCancel={onClose} busy={save.isPending} label={vehicle ? "Save changes" : "Add vehicle"} />}
    >
      <form id="drawer-form" className="grid gap-5" onSubmit={(e) => (e.preventDefault(), save.mutate(v, { onSuccess: onClose }))}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Plate number"><TextInput value={v.plateNo ?? ""} onChange={(e) => set("plateNo", e.target.value)} placeholder="WP LK-4821" /></Field>
          <Field label="Depot"><Select disabled={locked} value={v.depotId} onChange={(x) => set("depotId", x)} options={[{ value: "Peliyagoda", label: "Peliyagoda DC" }, { value: "Kandy", label: "Kandy hub" }]} /></Field>
          <Field label="Body"><Select disabled={locked} value={v.type} onChange={(x) => set("type", x)} options={[{ value: "truck", label: "Truck" }, { value: "van", label: "Van (reaches van-only outlets)" }]} /></Field>
          <Field label="Temperature"><Select disabled={locked} value={v.temp} onChange={(x) => set("temp", x)} options={[{ value: "ambient", label: "Dry-box" }, { value: "reefer", label: "Refrigerated (reefer)" }]} /></Field>
          <Field label="Volume capacity (m³)"><NumberInput required min={0.1} value={v.volumeCapM3} onChange={(x) => set("volumeCapM3", x ?? 0)} /></Field>
          <Field label="Weight capacity (kg)"><NumberInput required min={1} value={v.weightCapKg} onChange={(x) => set("weightCapKg", x ?? 0)} /></Field>
          <Field label="Fuel"><TextInput required value={v.fuelType} onChange={(e) => set("fuelType", e.target.value)} /></Field>
          <Field label="km per litre"><NumberInput required min={0.1} value={v.kmPerL} onChange={(x) => set("kmPerL", x ?? 0)} /></Field>
          <Field label="Weekly fuel quota (L)" hint="The planner refuses trips that would exceed it."><NumberInput required min={1} value={v.weeklyFuelQuotaL} onChange={(x) => set("weeklyFuelQuotaL", x ?? 0)} /></Field>
          <Field label="Status"><Select disabled={locked && v.status === "available"} value={v.status} onChange={(x) => set("status", x)} options={[{ value: "available", label: "Available" }, { value: "in_workshop", label: "In the workshop" }]} /></Field>
          <Field label="Driver" className="sm:col-span-2" hint="The driver app opens on this vehicle for them. New drivers and licences are added by HR in Waypoint People.">
            <Select
              value={v.driverId ?? ""}
              onChange={(x) => set("driverId", x || null)}
              placeholder="No driver"
              options={drivers.map((d) => ({ value: d.id, label: `${d.name}${d.onLeave ? " (on leave)" : ""}${d.vehicleId && d.vehicleId !== vehicle?.id ? ` · now on ${d.vehicleId}` : ""}` }))}
            />
          </Field>
        </div>
        <Toggle checked={v.active ?? true} onChange={(x) => set("active", x)} label="In the fleet" sub="Turn off to retire the vehicle. It stays in the records and history." />
      </form>
    </Drawer>
  );
}
