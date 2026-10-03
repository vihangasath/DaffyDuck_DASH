"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, Snowflake, WifiOff } from "lucide-react";
import { AppBar, Button, Card, Seg, Spinner, Stepper, cx } from "@/components/ui";
import { LoaderSync } from "@/components/loader/bits";
import { useLoader } from "@/components/loader/loader-context";
import { api, type Shortfall } from "@/lib/api";
import { outletName } from "@waypoint/core/reference";
import { linesFor } from "@waypoint/core/domain/catalog";
import { useAct } from "@/lib/hooks";
import { dockTrips } from "@waypoint/core/loading";
import { useSession } from "@/lib/session";
import { uploadPhotos } from "@/lib/photos";
import { PhotoPicker, usePhotoDrafts } from "@/components/photo-picker";

const MAX_PHOTOS = 3;

export default function FlagShortfall() {
  const { tripId } = useParams<{ tripId: string }>();
  const { db, connected, drain } = useLoader();
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
  const drafts = usePhotoDrafts();
  const [decision, setDecision] = useState<Shortfall["decision"]>("release");

  if (!db) return <Spinner />;
  if (!t) return <p className="p-6">Trip not found. <Link href="/loader" className="text-primary">Back</Link></p>;
  const sel = lines.find((l) => l.key === (key ?? lines.find((x) => x.load && x.load.loaded < x.load.planned)?.key ?? lines[0]?.key))!;
  const qty = loaded ?? sel.load?.loaded ?? 0;

  const send = async () => {
    // The ticks on this phone come first: the server checks the release against them.
    // Photos upload first, then the flag lists them.
    let photoIds: string[] = [];
    const ok = await run(async () => {
      if (!(await drain())) throw new Error("Some ticks haven’t reached the server yet. Try again when you have signal.");
      photoIds = await uploadPhotos("shortfall", sel.order.id, drafts.photos);
      return true;
    }) && await run(() =>
      api.flagShortfall({ tripId, orderId: sel.order.id, skuId: sel.line.skuId, loaded: qty, kind, decision, photo: photoIds.length > 0, photoIds }),
      decision === "hold" ? "Dispatcher alerted — vehicle held" : "Shortfall recorded — store informed",
    );
    if (!ok) return;
    const released = decision === "release" && (await run(() => api.releaseTrip(tripId).then(() => true)));
    router.push(released ? "/loader" : `/loader/${tripId}`);
  };

  return (
    <>
      <AppBar back={`/loader/${tripId}`} title="Flag an issue" sub={`${t.te.vehicle.id} · Trip ${t.te.trip.tripNo} · before departure`} right={<LoaderSync />} />
      <div className="grid gap-4 p-4">
        <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-ink-2">
          Item
          <select value={sel.key} onChange={(e) => { setKey(e.target.value); setLoaded(null); }} className="w-full min-w-0 rounded-xl border border-line-strong bg-surface px-3 py-3 text-base font-normal text-ink shadow-card focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15">
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
        <div className="grid gap-1.5">
          <span className="text-sm font-semibold text-ink-2">Photos {kind === "damaged" ? "(dispatch sees them with the flag)" : "(optional)"}</span>
          <PhotoPicker drafts={drafts} max={MAX_PHOTOS} inputLabel="Add photo of the item" alt="Photo" moreLabel="Another" />
        </div>
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
        {!connected && <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-warning"><WifiOff className="size-4" /> Needs signal: dispatch and the store are told straight away.</p>}
        <Button big icon={Check} busy={busy} disabled={(qty >= sel.line.qty && kind === "missing") || !connected} onClick={send}>
          {decision === "release" ? "Send & release" : "Send & hold vehicle"}
        </Button>
      </div>
    </>
  );
}
