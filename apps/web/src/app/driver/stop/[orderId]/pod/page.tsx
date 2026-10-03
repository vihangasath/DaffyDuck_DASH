"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, CheckCircle2, Circle, KeyRound, Loader2, Package, Snowflake, WifiOff, XCircle } from "lucide-react";
import { useDriver } from "@/components/driver/driver-context";
import { DriverSync, NotInRun, OfflineBanner } from "@/components/driver/bits";
import { SignaturePad } from "@/components/signature-pad";
import { AppBar, Button, Card, Pill, Stepper, cx } from "@/components/ui";
import { toast } from "@/components/toast";
import { net, outletName } from "@waypoint/core/reference";
import { linesFor } from "@waypoint/core/domain/catalog";
import { newId } from "@/lib/offline/outbox";
import { demoStamp } from "@waypoint/core/views";
import { api } from "@/lib/api";
import { OfflineError } from "@/lib/api/network";
import { PhotoPicker, usePhotoDrafts } from "@/components/photo-picker";

type CodeCheck = { state: "idle" | "checking" | "ok" | "bad" | "unchecked" | "locked"; left?: number; message?: string };

export default function Pod() {
  const { orderId } = useParams<{ orderId: string }>();
  const d = useDriver();
  const router = useRouter();
  const trip = d.trips.find((t) => t.stops.some((s) => s.orderId === orderId));
  const order = trip?.orders.find((o) => o.id === orderId);
  // Start from what was actually loaded at the dock (a flagged shortfall means fewer on the truck).
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries((order ? linesFor(order) : []).map((l) => [l.skuId, Math.min(l.qty, d.loaded[`${order!.id}|${l.skuId}`] ?? l.qty)])),
  );
  // Photos stay in memory until the delivery is completed, then go to the phone's outbox with it.
  const drafts = usePhotoDrafts();
  const photos = drafts.photos;
  const [signed, setSigned] = useState(false);
  const [receiver, setReceiver] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [check, setCheck] = useState<CodeCheck>({ state: "idle" });
  const [noCode, setNoCode] = useState(false);
  const [noCodeWhy, setNoCodeWhy] = useState("");

  // With signal, check the code as soon as it is complete; without, the server checks it on sync.
  useEffect(() => {
    if (code.length !== 6 || noCode) return;
    let live = true;
    const t = setTimeout(async () => {
      if (!d.online) return live && setCheck({ state: "unchecked" });
      setCheck({ state: "checking" });
      try {
        const r = await api.checkCode(orderId, code);
        if (live) setCheck(r.ok ? { state: "ok" } : { state: "bad", left: r.attemptsLeft });
      } catch (e) {
        if (!live) return;
        if (e instanceof OfflineError) setCheck({ state: "unchecked" });
        else setCheck({ state: "locked", message: e instanceof Error ? e.message : "Couldn’t check the code." });
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [code, noCode, orderId, d.online]);

  if (!trip || !order) return <NotInRun />;
  const stop = trip.stops.find((s) => s.orderId === orderId)!;
  const o = net.outlets.get(order.outletId)!;
  const lines = linesFor(order);
  const codeReady = noCode ? noCodeWhy.trim().length >= 3 : code.length === 6 && (check.state === "ok" || check.state === "unchecked");
  const ready = signed && receiver.trim().length > 1 && codeReady;

  const complete = async () => {
    setBusy(true);
    const service = net.serviceMin(orderId, order.brand, o.dockType);
    const photoIds: string[] = [];
    for (const p of photos) photoIds.push(await d.addPhoto(orderId, p.blob));
    await d.record({
      id: newId(),
      vehicleId: d.vehicleId,
      kind: "delivered",
      orderId,
      at: demoStamp(stop.arrive, orderId, service),
      recordedAt: new Date().toISOString(),
      pod: {
        receivedBy: receiver.trim(), signed, photos: photoIds.length, ...(photoIds.length ? { photoIds } : {}),
        lines: lines.map((l) => ({ skuId: l.skuId, name: l.name, planned: l.qty, delivered: qty[l.skuId] ?? l.qty })),
        ...(noCode ? { noCode: noCodeWhy.trim() } : { code }),
      },
    });
    toast.success(d.online ? "Delivery recorded" : "Saved on this phone — will sync automatically");
    router.push("/driver");
  };

  return (
    <>
      <AppBar back={`/driver/stop/${orderId}`} title="Proof of delivery" sub={`${outletName(o.id)} · ${o.id}`} right={<DriverSync />} />
      <OfflineBanner />
      <div className="grid gap-3 p-4">
        <Card className="grid gap-1 p-4">
          <h2 className="mb-1 font-bold">Items received</h2>
          {lines.map((l) => {
            const q = qty[l.skuId] ?? l.qty;
            const short = q < l.qty;
            return (
              <div key={l.skuId} className="flex items-center gap-2.5 py-1.5">
                {order.temp === "chilled" ? <Snowflake className="size-[18px] text-chilled" /> : <Package className="size-[18px] text-muted" />}
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-medium">{l.name}</div>
                  {short && <Pill tone="warning">Short {l.qty - q} · recorded</Pill>}
                  {(d.loaded[`${order.id}|${l.skuId}`] ?? l.qty) < l.qty && <p className="text-xs text-warning">Loaded {d.loaded[`${order.id}|${l.skuId}`]} at the dock — shortfall flagged</p>}
                </div>
                <Stepper value={q} max={l.qty} tone={short ? "warning" : undefined} onChange={(v) => setQty((s) => ({ ...s, [l.skuId]: v }))} />
              </div>
            );
          })}
        </Card>

        <Card className="grid gap-3 p-4">
          <div>
            <h2 className="flex items-center gap-2 font-bold"><KeyRound className="size-[18px] text-primary" /> Delivery code</h2>
            <p className="text-sm text-ink-2">Ask the person receiving for the 6-digit code in their DASH Stores app. It shows the goods reached the right store.</p>
          </div>
          {!noCode ? (
            <>
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setCheck({ state: "idle" });
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label="Delivery code"
                placeholder="••••••"
                disabled={check.state === "locked"}
                className={cx(
                  "w-full rounded-xl border-2 bg-surface px-3 py-3 text-center font-mono text-[28px] font-bold tracking-[0.5em] text-ink shadow-card placeholder:text-line-strong focus:outline-none focus:ring-4 disabled:bg-subtle",
                  check.state === "ok" ? "border-success focus:ring-success/15" : check.state === "bad" ? "border-danger focus:ring-danger/15" : "border-line-strong focus:border-primary focus:ring-primary/15",
                )}
              />
              <p role="status" className={cx("flex min-h-5 items-center gap-1.5 text-sm font-semibold", check.state === "ok" ? "text-success" : check.state === "bad" || check.state === "locked" ? "text-danger" : "text-ink-2")}>
                {check.state === "checking" && <><Loader2 className="size-4 animate-spin" /> Checking…</>}
                {check.state === "ok" && <><CheckCircle2 className="size-4" /> Code matches</>}
                {check.state === "bad" && <><XCircle className="size-4" /> That code doesn’t match{check.left != null ? ` · ${check.left} tr${check.left === 1 ? "y" : "ies"} left` : ""}</>}
                {check.state === "unchecked" && <><WifiOff className="size-4" /> No signal: the code is checked when this syncs</>}
                {check.state === "locked" && <><XCircle className="size-4" /> {check.message}</>}
              </p>
            </>
          ) : (
            <label className="grid gap-1.5 text-sm font-semibold text-ink-2">
              Why is there no code?
              <input value={noCodeWhy} onChange={(e) => setNoCodeWhy(e.target.value)} placeholder="e.g. Manager’s phone is off" className="rounded-xl border border-line-strong bg-surface px-3 py-3 text-base font-normal text-ink shadow-card focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15" />
              <span className="text-xs font-normal text-muted">Dispatch is told and checks with the store.</span>
            </label>
          )}
          <button type="button" onClick={() => setNoCode((v) => !v)} className="w-fit text-sm font-semibold text-primary">
            {noCode ? "Enter the code instead" : "Receiver has no code"}
          </button>
        </Card>

        <Card className="grid gap-3 p-4">
          <h2 className="font-bold">Photos &amp; signature</h2>
          <PhotoPicker drafts={drafts} size="sm" inputLabel="Add delivery photo" alt="Delivery photo" />
          {photos.length > 0 && <p className="text-xs text-ink-2">Saved on this phone with the delivery; uploads to dispatch when there’s signal.</p>}
          <SignaturePad onChange={setSigned} />
          <label className="grid gap-1.5 text-sm font-semibold text-ink-2">
            Received by
            <input value={receiver} onChange={(e) => setReceiver(e.target.value)} placeholder="Name of the person signing" className="rounded-xl border border-line-strong bg-surface px-3 py-3 text-base font-normal text-ink shadow-card focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15" />
          </label>
        </Card>

        <p className="flex items-center justify-center gap-2 text-sm font-medium text-success">
          <CheckCircle2 className="size-4" /> Saved on this phone first · syncs automatically
        </p>
        <Button big icon={Check} disabled={!ready} busy={busy} onClick={complete}>
          Complete delivery
        </Button>
        {!ready && (
          <p className="flex justify-center gap-4 text-xs font-semibold">
            {([["Code", codeReady], ["Signature", signed], ["Receiver’s name", receiver.trim().length > 1]] as const).map(([label, ok]) => (
              <span key={label} className={cx("flex items-center gap-1", ok ? "text-success" : "text-muted")}>
                {ok ? <CheckCircle2 className="size-3.5" /> : <Circle className="size-3.5" />} {label}
              </span>
            ))}
          </p>
        )}
      </div>
    </>
  );
}
