"use client";
import { useState } from "react";
import { Package, Plus, Snowflake } from "lucide-react";
import type { ProductRow } from "@waypoint/core/records";
import { BrandPill, Button, Pill } from "@waypoint/ui/ui";
import { PageHeader } from "@/components/dispatcher-shell";
import { Chips, DataTable, Drawer, Field, NumberInput, SaveBar, Select, TextInput, Toggle, Toolbar, matches, type Column } from "@waypoint/ui/kit";
import { records, useRecords, useRecordsMutation } from "@/lib/records";

const BLANK: ProductRow = { id: "", name: "", unit: "", brand: "Fresh", temp: "ambient", weightKg: 1, volumeM3: 0.01, active: true };

export default function ProductsPage() {
  const { data, error, isLoading } = useRecords<ProductRow[]>("/products");
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState("all");
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);
  const d = data ?? [];
  const rows = data?.filter((p) => matches(q, p.id, p.name, p.unit) && (brand === "all" || p.brand === brand));
  const columns: Column<ProductRow>[] = [
    { key: "name", header: "Product", sort: (p) => p.name, cell: (p) => <span><b className="block">{p.name}</b><span className="text-xs text-ink-2">{p.id} · {p.unit}</span></span> },
    { key: "brand", header: "Brand", sort: (p) => p.brand, cell: (p) => <BrandPill brand={p.brand} /> },
    { key: "temp", header: "Handling", sort: (p) => p.temp, cell: (p) => (p.temp === "chilled" ? <Pill tone="chilled" icon={Snowflake}>Chilled</Pill> : <Pill>Dry</Pill>) },
    { key: "w", header: "Weight", align: "right", sort: (p) => p.weightKg, cell: (p) => `${p.weightKg} kg` },
    { key: "v", header: "Volume", align: "right", sort: (p) => p.volumeM3, cell: (p) => `${p.volumeM3} m³` },
    { key: "status", header: "Status", sort: (p) => (p.active ? 0 : 1), cell: (p) => (p.active ? <Pill tone="success" dot>On sale</Pill> : <Pill>Withdrawn</Pill>) },
  ];
  return (
    <>
      <PageHeader title="Products" sub="What stores can order. Weight and volume drive the planner’s capacity checks." actions={<Button icon={Plus} onClick={() => setEditing("new")}>Add product</Button>} />
      <div className="grid gap-4 p-5 lg:p-7">
        <Toolbar q={q} onQ={setQ} placeholder="Search name, id or unit" count={rows ? `${rows.length} shown` : undefined}>
          <Chips value={brand} onChange={setBrand} options={[{ value: "all", label: "All", n: d.length }, ...(["Fresh", "Style", "Tech"] as const).map((b) => ({ value: b, label: b, n: d.filter((p) => p.brand === b).length }))]} />
        </Toolbar>
        <DataTable rows={rows} loading={isLoading} error={error?.message} columns={columns} rowKey={(p) => p.id} onRowClick={setEditing} dim={(p) => !p.active} initialSort={{ key: "brand", dir: 1 }} minWidth={700} empty={{ icon: Package, title: "No products match" }} />
      </div>
      {editing && <ProductDrawer key={editing === "new" ? "new" : editing.id} product={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ProductDrawer({ product, onClose }: { product: ProductRow | null; onClose: () => void }) {
  const [p, setP] = useState<ProductRow>(product ?? BLANK);
  const set = <K extends keyof ProductRow>(k: K, v: ProductRow[K]) => setP((x) => ({ ...x, [k]: v }));
  const save = useRecordsMutation((x: ProductRow) => (product ? records(`/products/${product.id}`, { method: "PATCH", body: x }) : records("/products", { body: x })), product ? `${p.name} updated` : `${p.name} added`);
  return (
    <Drawer open onClose={onClose} title={product ? product.name : "Add a product"} sub={product ? `${product.id} · orders already placed keep their lines` : "Stores of the same brand can order it straight away."} footer={<SaveBar onCancel={onClose} busy={save.isPending} label={product ? "Save changes" : "Add product"} />}>
      <form id="drawer-form" className="grid gap-5" onSubmit={(e) => (e.preventDefault(), save.mutate(p, { onSuccess: onClose }))}>
        <div className="grid gap-4 sm:grid-cols-2">
          {!product && <Field label="Product code" hint="e.g. F-EGGS"><TextInput required value={p.id} onChange={(e) => set("id", e.target.value.toUpperCase())} /></Field>}
          <Field label="Name" className={product ? "sm:col-span-2" : ""}><TextInput required value={p.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Unit"><TextInput required value={p.unit} onChange={(e) => set("unit", e.target.value)} placeholder="Crate of 12" /></Field>
          <Field label="Brand"><Select value={p.brand} onChange={(v) => setP((x) => ({ ...x, brand: v, temp: v === "Fresh" ? x.temp : "ambient" }))} options={[{ value: "Fresh", label: "Fresh" }, { value: "Style", label: "Style" }, { value: "Tech", label: "Tech" }]} /></Field>
          <Field label="Handling"><Select value={p.temp} disabled={p.brand !== "Fresh"} onChange={(v) => set("temp", v)} options={[{ value: "ambient", label: "Dry" }, { value: "chilled", label: "Chilled (reefer only)" }]} /></Field>
          <Field label="Weight per unit (kg)"><NumberInput required min={0.01} value={p.weightKg} onChange={(v) => set("weightKg", v ?? 0)} /></Field>
          <Field label="Volume per unit (m³)"><NumberInput required min={0.001} value={p.volumeM3} onChange={(v) => set("volumeM3", v ?? 0)} /></Field>
        </div>
        <Toggle checked={p.active} onChange={(v) => set("active", v)} label="On sale" sub="Withdrawn products disappear from the store order form." />
      </form>
    </Drawer>
  );
}
