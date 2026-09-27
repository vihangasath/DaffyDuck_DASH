"use client";
import { useState } from "react";
import { MapPin, Plus, Store } from "lucide-react";
import type { Lookups, OutletRow } from "@waypoint/core/admin";
import { BrandPill, Button, Pill } from "@waypoint/ui/ui";
import { PageHeader } from "@/components/shell";
import { Chips, DataTable, Drawer, Field, NumberInput, SaveBar, Select, TextInput, Toggle, Toolbar, matches, type Column } from "@/components/kit";
import { api, useAdminMutation, useAdminQuery } from "@/lib/api";

type Draft = Omit<OutletRow, "id" | "managers" | "ordersToday">;
const BLANK: Draft = { name: "", brand: "Fresh", district: "", depotId: "Peliyagoda", dockType: "rear_dock", parking: "normal", mallWindow: null, windowOpen: "05:00", windowClose: "08:00", lat: null, lng: null, phone: "", active: true };
const DOCK = { rear_dock: "Rear dock", street: "Street", mall_bay: "Mall bay" };
const PARKING = { normal: "Any vehicle", van_only: "Van only", mall_dock: "Mall dock" };

export default function BranchesPage() {
  const { data, error, isLoading } = useAdminQuery<OutletRow[]>("/outlets");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<OutletRow | "new" | null>(null);
  const d = data ?? [];
  const rows = data?.filter((o) => matches(q, o.id, o.name, o.district, ...o.managers) && (filter === "all" || (filter === "closed" ? !o.active : o.brand === filter || o.depotId === filter)));

  const columns: Column<OutletRow>[] = [
    { key: "id", header: "Branch", sort: (o) => o.id, cell: (o) => <span><b className="block">{o.name}</b><span className="text-xs text-ink-2">{o.id} · {o.district}</span></span> },
    { key: "brand", header: "Brand", sort: (o) => o.brand, cell: (o) => <BrandPill brand={o.brand} /> },
    { key: "depot", header: "Served from", sort: (o) => o.depotId, cell: (o) => (o.depotId === "Kandy" ? "Kandy hub" : "Peliyagoda") },
    { key: "window", header: "Delivery window", sort: (o) => o.windowOpen, cell: (o) => <span className="tabular-nums">{o.mallWindow ? `Mall ${o.mallWindow}` : `${o.windowOpen}–${o.windowClose}`}</span> },
    { key: "access", header: "Access", cell: (o) => <span className="flex flex-wrap gap-1"><Pill>{DOCK[o.dockType]}</Pill>{o.parking !== "normal" && <Pill tone="warning">{PARKING[o.parking]}</Pill>}</span> },
    { key: "mgr", header: "Manager login", cell: (o) => (o.managers.length ? o.managers.join(", ") : <span className="text-muted">None</span>) },
    { key: "today", header: "Orders today", align: "right", sort: (o) => o.ordersToday, cell: (o) => o.ordersToday || "—" },
    { key: "status", header: "Status", sort: (o) => (o.active ? 0 : 1), cell: (o) => (o.active ? <Pill tone="success" dot>Open</Pill> : <Pill>Closed</Pill>) },
  ];

  return (
    <>
      <PageHeader title="Branches" sub="Every Waypoint Fresh, Style and Tech outlet: where it is, when it accepts deliveries and how trucks get in." actions={<Button icon={Plus} onClick={() => setEditing("new")}>Add branch</Button>} />
      <div className="grid gap-4 p-5 lg:p-7">
        <Toolbar q={q} onQ={setQ} placeholder="Search name, id, district or manager" count={rows ? `${rows.length} shown` : undefined}>
          <Chips
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", n: d.length },
              { value: "Fresh", label: "Fresh", n: d.filter((o) => o.brand === "Fresh").length },
              { value: "Style", label: "Style", n: d.filter((o) => o.brand === "Style").length },
              { value: "Tech", label: "Tech", n: d.filter((o) => o.brand === "Tech").length },
              { value: "Kandy", label: "Kandy hub", n: d.filter((o) => o.depotId === "Kandy").length },
              { value: "closed", label: "Closed", n: d.filter((o) => !o.active).length },
            ]}
          />
        </Toolbar>
        <DataTable rows={rows} loading={isLoading} error={error?.message} columns={columns} rowKey={(o) => o.id} onRowClick={setEditing} dim={(o) => !o.active} initialSort={{ key: "id", dir: 1 }} minWidth={980} empty={{ icon: Store, title: "No branches match" }} />
      </div>
      {editing && <BranchDrawer key={editing === "new" ? "new" : editing.id} outlet={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function BranchDrawer({ outlet, onClose }: { outlet: OutletRow | null; onClose: () => void }) {
  const { data: look } = useAdminQuery<Lookups>("/lookups");
  const [o, setO] = useState<Draft>(outlet ? { ...outlet } : BLANK);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setO((x) => ({ ...x, [k]: v }));
  const save = useAdminMutation(
    (x: Draft) => {
      const body = { ...x, phone: x.phone || null, mallWindow: x.parking === "mall_dock" ? x.mallWindow || null : null };
      return outlet ? api(`/admin/outlets/${outlet.id}`, { method: "PATCH", body }) : api<{ id: string }>("/admin/outlets", { body });
    },
    (r) => (outlet ? `${o.name} updated` : `${o.name} added as ${(r as { id: string }).id}`),
  );
  const districts = [...new Set((look?.districts ?? []).filter((x) => x.depot === o.depotId).map((x) => x.district))];
  return (
    <Drawer
      open
      onClose={onClose}
      title={outlet ? `${outlet.name}` : "Add a branch"}
      sub={outlet ? `${outlet.id} · ${outlet.ordersToday} order${outlet.ordersToday === 1 ? "" : "s"} today` : "Store managers can order for it once they have a login."}
      footer={<SaveBar onCancel={onClose} busy={save.isPending} label={outlet ? "Save changes" : "Add branch"} />}
    >
      <form id="drawer-form" className="grid gap-5" onSubmit={(e) => (e.preventDefault(), save.mutate(o, { onSuccess: onClose }))}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Branch name" className="sm:col-span-2"><TextInput required value={o.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Nugegoda" /></Field>
          <Field label="Brand"><Select value={o.brand} onChange={(v) => set("brand", v)} options={[{ value: "Fresh", label: "Waypoint Fresh" }, { value: "Style", label: "Waypoint Style" }, { value: "Tech", label: "Waypoint Tech" }]} /></Field>
          <Field label="Phone"><TextInput type="tel" value={o.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="Served from"><Select value={o.depotId} onChange={(v) => setO((x) => ({ ...x, depotId: v, district: "" }))} options={(look?.depots ?? []).map((x) => ({ value: x.id, label: x.name }))} /></Field>
          <Field label="District" hint="Only districts this depot delivers to."><Select required value={o.district} onChange={(v) => set("district", v)} placeholder="Choose a district" options={districts.map((x) => ({ value: x, label: x }))} /></Field>
          <Field label="Window opens"><TextInput required type="time" value={o.windowOpen} onChange={(e) => set("windowOpen", e.target.value)} /></Field>
          <Field label="Window closes"><TextInput required type="time" value={o.windowClose} onChange={(e) => set("windowClose", e.target.value)} /></Field>
          <Field label="Unloading"><Select value={o.dockType} onChange={(v) => set("dockType", v)} options={Object.entries(DOCK).map(([value, label]) => ({ value: value as Draft["dockType"], label }))} /></Field>
          <Field label="Vehicle access"><Select value={o.parking} onChange={(v) => set("parking", v)} options={Object.entries(PARKING).map(([value, label]) => ({ value: value as Draft["parking"], label }))} /></Field>
          {o.parking === "mall_dock" && (
            <Field label="Mall loading window" hint="HH:MM-HH:MM, e.g. 06:00-09:00" className="sm:col-span-2"><TextInput required value={o.mallWindow ?? ""} onChange={(e) => set("mallWindow", e.target.value)} placeholder="06:00-09:00" /></Field>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Latitude" hint="Leave empty to place it at the district’s centre."><NumberInput value={o.lat} onChange={(v) => set("lat", v)} step="0.0001" /></Field>
          <Field label="Longitude"><NumberInput value={o.lng} onChange={(v) => set("lng", v)} step="0.0001" /></Field>
          {o.lat != null && o.lng != null && (
            <a className="flex items-center gap-1.5 text-sm font-semibold text-primary sm:col-span-2" href={`https://www.openstreetmap.org/?mlat=${o.lat}&mlon=${o.lng}#map=16/${o.lat}/${o.lng}`} target="_blank" rel="noreferrer">
              <MapPin className="size-4" /> Check the pin on the map
            </a>
          )}
        </div>
        <Toggle checked={o.active ?? true} onChange={(v) => set("active", v)} label="Open for orders" sub="Closed branches can’t place new orders. History is kept." />
      </form>
    </Drawer>
  );
}
