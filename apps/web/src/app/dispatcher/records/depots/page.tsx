"use client";
import { useState } from "react";
import { Building2, MapPin, Pencil, Phone } from "lucide-react";
import type { DepotRow } from "@waypoint/core/records";
import { Button, Card, Spinner } from "@waypoint/ui/ui";
import { PageHeader } from "@/components/dispatcher-shell";
import { Drawer, Field, NumberInput, SaveBar, TextInput } from "@waypoint/ui/kit";
import { records, useRecords, useRecordsMutation } from "@/lib/records";

export default function DepotsPage() {
  const { data, error } = useRecords<DepotRow[]>("/depots");
  const [editing, setEditing] = useState<DepotRow | null>(null);
  return (
    <>
      <PageHeader title="Depots" sub="The distribution centres trips start from. Each has its own fleet, dock, drivers and plan." />
      <div className="grid gap-4 p-5 md:grid-cols-2 lg:p-7">
        {error && <p className="text-danger">{error.message}</p>}
        {!data && !error && <Spinner />}
        {data?.map((d) => (
          <Card key={d.id} className="grid gap-4 p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-11 items-center justify-center rounded-xl bg-navy text-mint"><Building2 className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold tracking-tight">{d.name}</h2>
                <p className="text-sm text-ink-2">{d.district} district</p>
              </div>
              <Button kind="secondary" sm icon={Pencil} onClick={() => setEditing(d)}>Edit</Button>
            </div>
            <div className="grid gap-1.5 text-sm text-ink-2">
              <p className="flex items-center gap-2"><MapPin className="size-4" /> {d.address ?? "No address yet"}</p>
              <p className="flex items-center gap-2"><Phone className="size-4" /> {d.phone ?? "No phone yet"}</p>
            </div>
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line">
              {[["Branches", d.outlets], ["Vehicles", d.vehicles], ["Drivers", d.drivers]].map(([k, v]) => (
                <div key={k} className="bg-surface p-3">
                  <div className="text-xs font-semibold text-ink-2">{k}</div>
                  <div className="text-2xl font-bold tabular-nums tracking-tight">{v}</div>
                </div>
              ))}
            </div>
          </Card>
        ))}
        <p className="text-sm text-ink-2 md:col-span-2">The planner is configured per depot, so depots are edited here but added with the engineering team.</p>
      </div>
      {editing && <DepotDrawer key={editing.id} depot={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function DepotDrawer({ depot, onClose }: { depot: DepotRow; onClose: () => void }) {
  const [d, setD] = useState({ name: depot.name, address: depot.address ?? "", phone: depot.phone ?? "", lat: depot.lat, lng: depot.lng });
  const save = useRecordsMutation((x: typeof d) => records(`/depots/${depot.id}`, { method: "PATCH", body: { ...x, address: x.address || null, phone: x.phone || null } }), `${d.name} updated`);
  return (
    <Drawer open onClose={onClose} title={depot.name} sub="Trips are timed from the depot’s position." footer={<SaveBar onCancel={onClose} busy={save.isPending} />}>
      <form id="drawer-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), save.mutate(d, { onSuccess: onClose }))}>
        <Field label="Name" className="sm:col-span-2"><TextInput required value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
        <Field label="Address" className="sm:col-span-2"><TextInput value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} /></Field>
        <Field label="Phone"><TextInput type="tel" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} /></Field>
        <span />
        <Field label="Latitude"><NumberInput required value={d.lat} onChange={(v) => setD({ ...d, lat: v ?? d.lat })} step="0.0001" /></Field>
        <Field label="Longitude"><NumberInput required value={d.lng} onChange={(v) => setD({ ...d, lng: v ?? d.lng })} step="0.0001" /></Field>
      </form>
    </Drawer>
  );
}
