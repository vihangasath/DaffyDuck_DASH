"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { IdCard, Plus, UserPlus } from "lucide-react";
import type { DriverRow, Lookups } from "@waypoint/core/admin";
import { Button, Card, Pill, type Tone } from "@waypoint/ui/ui";
import { PageHeader } from "@/components/shell";
import { Chips, DataTable, Drawer, Field, SaveBar, Select, TextInput, Toolbar, matches, type Column } from "@/components/kit";
import { api, useAdminMutation, useAdminQuery } from "@/lib/api";

type Draft = Omit<DriverRow, "id" | "login" | "deliveredToday">;
const BLANK: Draft = { name: "", phone: "", licenseNo: "", licenseClass: "C1", licenseExpiry: "", depotId: "Peliyagoda", vehicleId: null, status: "active", hiredOn: "" };
const STATUS: Record<DriverRow["status"], { label: string; tone: Tone }> = { active: { label: "Active", tone: "success" }, on_leave: { label: "On leave", tone: "warning" }, inactive: { label: "Left", tone: "neutral" } };
const soon = () => new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);

export default function DriversPage() {
  return (
    <Suspense>
      <Drivers />
    </Suspense>
  );
}

function Drivers() {
  const params = useSearchParams();
  const { data, error, isLoading } = useAdminQuery<DriverRow[]>("/drivers");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>(params.get("filter") ?? "all");
  const [editing, setEditing] = useState<DriverRow | "new" | null>(null);

  const due = soon();
  const counts = useMemo(() => {
    const d = data ?? [];
    return {
      all: d.length, active: d.filter((x) => x.status === "active").length, on_leave: d.filter((x) => x.status === "on_leave").length,
      licence: d.filter((x) => x.status !== "inactive" && x.licenseExpiry && x.licenseExpiry <= due).length,
      unassigned: d.filter((x) => x.status === "active" && !x.vehicleId).length, nologin: d.filter((x) => x.status === "active" && !x.login).length,
    };
  }, [data, due]);
  const rows = data?.filter(
    (d) =>
      matches(q, d.id, d.name, d.phone, d.vehicleId, d.licenseNo, d.login?.username) &&
      (filter === "all" || (filter === "licence" ? d.status !== "inactive" && !!d.licenseExpiry && d.licenseExpiry <= due : filter === "unassigned" ? d.status === "active" && !d.vehicleId : filter === "nologin" ? d.status === "active" && !d.login : d.status === filter)),
  );

  const columns: Column<DriverRow>[] = [
    { key: "id", header: "Driver", sort: (d) => d.name, cell: (d) => <span><b className="block">{d.name}</b><span className="text-xs text-ink-2">{d.id}{d.phone ? ` · ${d.phone}` : ""}</span></span> },
    { key: "depot", header: "Depot", sort: (d) => d.depotId, cell: (d) => (d.depotId === "Kandy" ? "Kandy hub" : "Peliyagoda") },
    { key: "vehicle", header: "Vehicle", sort: (d) => d.vehicleId ?? "~", cell: (d) => d.vehicleId ? <b className="tabular-nums">{d.vehicleId}</b> : <span className="text-warning">Not assigned</span> },
    {
      key: "licence", header: "Licence", sort: (d) => d.licenseExpiry ?? "9999",
      cell: (d) => (
        <span className="grid">
          <span className="tabular-nums">{d.licenseNo ?? "—"} {d.licenseClass && <span className="text-ink-2">· {d.licenseClass}</span>}</span>
          {d.licenseExpiry && <span className={d.licenseExpiry <= due && d.status !== "inactive" ? "text-xs font-semibold text-danger" : "text-xs text-ink-2"}>expires {d.licenseExpiry}</span>}
        </span>
      ),
    },
    { key: "status", header: "Status", sort: (d) => d.status, cell: (d) => <Pill tone={STATUS[d.status].tone} dot>{STATUS[d.status].label}</Pill> },
    { key: "login", header: "App login", cell: (d) => (d.login ? <span className="text-sm">{d.login.username}{!d.login.active && <span className="text-danger"> · disabled</span>}</span> : <span className="text-sm text-muted">None</span>) },
    { key: "today", header: "Delivered today", align: "right", sort: (d) => d.deliveredToday, cell: (d) => d.deliveredToday || "—" },
  ];

  return (
    <>
      <PageHeader title="Drivers" sub="Everyone who drives for Waypoint: licences, assigned vehicles and app logins." actions={<Button icon={Plus} onClick={() => setEditing("new")}>Add driver</Button>} />
      <div className="grid gap-4 p-5 lg:p-7">
        <Toolbar q={q} onQ={setQ} placeholder="Search name, phone, vehicle, licence" count={rows ? `${rows.length} shown` : undefined}>
          <Chips
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", n: counts.all },
              { value: "active", label: "Active", n: counts.active },
              { value: "on_leave", label: "On leave", n: counts.on_leave },
              { value: "licence", label: "Licence due", n: counts.licence },
              { value: "unassigned", label: "No vehicle", n: counts.unassigned },
              { value: "nologin", label: "No login", n: counts.nologin },
            ]}
          />
        </Toolbar>
        <DataTable
          rows={rows}
          loading={isLoading}
          error={error?.message}
          columns={columns}
          rowKey={(d) => d.id}
          onRowClick={setEditing}
          dim={(d) => d.status === "inactive"}
          initialSort={{ key: "id", dir: 1 }}
          empty={{ icon: IdCard, title: "No drivers match", body: "Try a different search or filter." }}
        />
      </div>
      {editing && <DriverDrawer key={editing === "new" ? "new" : editing.id} driver={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function DriverDrawer({ driver, onClose }: { driver: DriverRow | null; onClose: () => void }) {
  const { data: look } = useAdminQuery<Lookups>("/lookups");
  const [d, setD] = useState<Draft>(driver ? { ...driver } : BLANK);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const save = useAdminMutation(
    (x: Draft) => {
      const body = { ...x, phone: x.phone || null, licenseNo: x.licenseNo || null, licenseClass: x.licenseClass || null, licenseExpiry: x.licenseExpiry || null, hiredOn: x.hiredOn || null, vehicleId: x.vehicleId || null };
      return driver ? api(`/admin/drivers/${driver.id}`, { method: "PATCH", body }) : api<{ id: string }>("/admin/drivers", { body });
    },
    driver ? `${d.name} updated` : `${d.name} added`,
  );
  const vehicles = (look?.vehicles ?? []).filter((v) => v.depot === d.depotId && v.active);

  return (
    <Drawer
      open
      onClose={onClose}
      title={driver ? driver.name : "Add a driver"}
      sub={driver ? `${driver.id} · ${driver.deliveredToday} delivered today` : "They’ll appear in the driver list straight away. Give them an app login afterwards."}
      footer={<SaveBar onCancel={onClose} busy={save.isPending} label={driver ? "Save changes" : "Add driver"} />}
    >
      <form id="drawer-form" className="grid gap-6" onSubmit={(e) => (e.preventDefault(), save.mutate(d, { onSuccess: onClose }))}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" className="sm:col-span-2"><TextInput required value={d.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Mobile"><TextInput type="tel" value={d.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="+94 77 123 4567" /></Field>
          <Field label="Status">
            <Select value={d.status} onChange={(v) => set("status", v)} options={[{ value: "active", label: "Active" }, { value: "on_leave", label: "On leave" }, { value: "inactive", label: "Left Waypoint" }]} />
          </Field>
          <Field label="Depot">
            <Select value={d.depotId} onChange={(v) => setD((x) => ({ ...x, depotId: v, vehicleId: null }))} options={(look?.depots ?? []).map((x) => ({ value: x.id, label: x.name }))} />
          </Field>
          <Field label="Assigned vehicle" hint="The vehicle their app opens on. Only this depot’s vehicles are listed.">
            <Select value={d.vehicleId ?? ""} onChange={(v) => set("vehicleId", v || null)} placeholder="No vehicle" options={vehicles.map((v) => ({ value: v.id, label: v.label }))} />
          </Field>
          <Field label="Licence number"><TextInput value={d.licenseNo ?? ""} onChange={(e) => set("licenseNo", e.target.value)} /></Field>
          <Field label="Licence class"><TextInput value={d.licenseClass ?? ""} onChange={(e) => set("licenseClass", e.target.value)} placeholder="B, C1, C" /></Field>
          <Field label="Licence expires"><TextInput type="date" value={d.licenseExpiry ?? ""} onChange={(e) => set("licenseExpiry", e.target.value)} /></Field>
          <Field label="Joined Waypoint"><TextInput type="date" value={d.hiredOn ?? ""} onChange={(e) => set("hiredOn", e.target.value)} /></Field>
        </div>
        {d.status === "inactive" && driver?.login?.active && <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning">Saving as “Left Waypoint” also disables their login ({driver.login.username}) and signs them out.</p>}
        {driver && (
          <Card className="flex items-center gap-3 p-4">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><UserPlus className="size-5" /></span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">{driver.login ? `Signs in as “${driver.login.username}”` : "No app login yet"}</p>
              <p className="text-ink-2">{driver.login ? "Reset the password or disable it under User accounts." : "Create one so they can use the driver app."}</p>
            </div>
            <Link href={driver.login ? `/users?open=${driver.login.userId}` : `/users?newDriver=${driver.id}`} className="text-sm font-semibold text-primary">
              {driver.login ? "Manage" : "Create login"}
            </Link>
          </Card>
        )}
      </form>
    </Drawer>
  );
}
