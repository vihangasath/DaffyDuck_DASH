"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, Camera, Check, Snowflake } from "lucide-react";
import { Button, Card, Seg, Spinner, Stepper, cx } from "@/components/ui";
import { api, type Shortfall } from "@/lib/api";
import { outletName } from "@waypoint/core/reference";
import { linesFor } from "@waypoint/core/domain/catalog";
import { useAct, useDb } from "@/lib/hooks";
import { dockTrips } from "@waypoint/core/loading";
import { useSession } from "@/lib/session";

export default function FlagShortfall() {
  const { tripId } = useParams<{ tripId: string }>();
  const { data: db } = useDb();
  const [session] = useSession();
  const router = useRouter();
  const { run, busy } = useAct();
  const t = useMemo(() => (db ? dockTrips(db, session?.depot ?? "Peliyagoda", Infinity).find((x) => x.te.trip.id === tripId) : undefined), [db, session, tripId]);

  const lines = useMemo(
    () =>
      t
        ? t.te.stops.flatMap((s) => {
            const order = t.te.orders.find((o) => o.id === s.orderId)!;
            return linesFor(order).map((l) => ({ key: `${order.id}|${l.skuId}`, order, stop: s, line: l, load: t.load.lines[`${order.id}|${l.skuId}`] }));
          })
        : [],
    [t],
  );
  const [key, setKey] = useState<string | null>(null);
  const [kind, setKind] = useState<Shortfall["kind"]>("missing");
  const [loaded, setLoaded] = useState<number | null>(null);
  const [photo, setPhoto] = useState(false);
  const [decision, setDecision] = useState<Shortfall["decision"]>("release");

  if (!db) return <Spinner />;
  if (!t) return <p className="p-6">Trip not found. <Link href="/loader" className="text-primary">Back</Link></p>;
  const sel = lines.find((l) => l.key === (key ?? lines.find((x) => x.load && x.load.loaded < x.load.planned)?.key ?? lines[0]?.key))!;
  const qty = loaded ?? sel.load?.loaded ?? 0;

  const send = async () => {
    const ok = await run(() =>
      api.flagShortfall({
        tripId, vehicleId: t.te.vehicle.id, orderId: sel.order.id, outletId: sel.order.outletId, skuId: sel.line.skuId, name: sel.line.name,
        planned: sel.line.qty, loaded: qty, kind, decision, photo, by: session?.name ?? "Loader",
      }),
      decision === "hold" ? "Dispatcher alerted — vehicle held" : "Shortfall recorded — store informed",
    );
    if (!ok) return;
    const released = decision === "release" && (await run(() => api.releaseTrip(tripId, session?.name ?? "Loader").then(() => true)));
    router.push(released ? "/loader" : `/loader/${tripId}`);
  };

  return (
    <div className="mx-auto max-w-lg pb-10">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3.5">
        <Link href={`/loader/${tripId}`} aria-label="Back" className="-ml-1.5 flex size-10 items-center justify-center rounded-xl transition-colors hover:bg-subtle"><ArrowLeft className="size-6" /></Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Flag an issue</h1>
          <p className="text-[13px] text-ink-2">{t.te.vehicle.id} · Trip {t.te.trip.tripNo} · before departure</p>
        </div>
      </header>
      <div className="grid gap-4 p-4">
        <label className="grid gap-1.5 text-sm font-semibold text-ink-2">
          Item
          <select value={sel.key} onChange={(e) => { setKey(e.target.value); setLoaded(null); }} className="rounded-xl border border-line-strong bg-surface px-3 py-3 text-base font-normal text-ink shadow-card focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15">
            {lines.map((l) => (
              <option key={l.key} value={l.key}>
                Stop {l.stop.seq + 1} {outletName(l.order.outletId)} · {l.line.name} ({l.load?.loaded ?? 0}/{l.line.qty})
              </option>
            ))}
          </select>
        </label>
        <Card className="flex items-center gap-3 p-4">
          {sel.order.temp === "chilled" && <Snowflake className="size-6 text-chilled" />}
          <div className="flex-1">
            <p className="font-bold">{sel.line.name}</p>
            <p className="text-sm text-ink-2">Planned {sel.line.qty} · {sel.line.unit}</p>
          </div>
        </Card>
        <div className="grid gap-1.5">
          <span className="text-sm font-semibold text-ink-2">What’s wrong?</span>
          <Seg big fill value={kind} onChange={setKind} options={[{ value: "missing", label: "Missing" }, { value: "damaged", label: "Damaged" }, { value: "wrong_item", label: "Wrong item" }]} />
        </div>
        <Card className="flex items-center justify-between gap-3 p-4">
          <span className="font-medium">Quantity actually loaded</span>
          <Stepper big value={qty} max={sel.line.qty} onChange={setLoaded} />
        </Card>
        <label className={cx("flex w-fit cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 text-sm font-semibold transition-colors", photo ? "border-success/50 bg-success-soft text-success" : "border-line-strong text-primary hover:border-primary hover:bg-primary-soft")}>
          {photo ? <Check className="size-5" /> : <Camera className="size-5" />} {photo ? "Photo attached" : "Add photo (optional)"}
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => setPhoto((p) => p || !!e.target.files?.length)} />
        </label>
        <div role="radiogroup" className="grid gap-2">
          <span className="text-sm font-semibold text-ink-2">Then</span>
          {([
            ["release", "Release with shortfall", `Store ${outletName(sel.order.outletId)} is told ${qty} of ${sel.line.qty} arrive; the balance goes on the next run.`],
            ["hold", "Hold vehicle for dispatcher", "Dispatcher decides: re-pick, move it to another vehicle, or send tomorrow."],
          ] as const).map(([v, title, sub]) => (
            <button key={v} role="radio" aria-checked={decision === v} onClick={() => setDecision(v)} className={cx("flex gap-3 rounded-xl border p-4 text-left transition-[border-color,background-color,box-shadow] duration-150", decision === v ? "border-primary bg-primary-soft ring-2 ring-primary/25" : "border-line bg-surface shadow-card hover:border-line-strong")}>
              <span className={cx("mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full border-2", decision === v ? "border-primary" : "border-line-strong")}>{decision === v && <span className="size-2.5 rounded-full bg-primary" />}</span>
              <span><b className="block">{title}</b><span className="text-sm text-ink-2">{sub}</span></span>
            </button>
          ))}
        </div>
        <Button big icon={Check} busy={busy} disabled={qty >= sel.line.qty && kind === "missing"} onClick={send}>
          {decision === "release" ? "Send & release" : "Send & hold vehicle"}
        </Button>
      </div>
    </div>
  );
}
