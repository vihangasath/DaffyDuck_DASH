"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Camera, Check, CheckCircle2, Circle, Package, Plus, Snowflake, MapPinOff } from "lucide-react";
import { useDriver } from "@/components/driver/driver-context";
import { DriverSync, OfflineBanner } from "@/components/driver/bits";
import { SignaturePad } from "@/components/signature-pad";
import { AppBar, Button, Card, Pill, Stepper, cx, Empty } from "@/components/ui";
import { toast } from "@/components/toast";
import { net, outletName } from "@waypoint/core/reference";
import { linesFor } from "@waypoint/core/domain/catalog";
import { newId } from "@/lib/offline/outbox";
import { demoStamp } from "@waypoint/core/views";

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
  const [photos, setPhotos] = useState<string[]>([]);
  // Camera photos are full-size blobs held in memory; release them when the driver leaves this screen.
  const photoUrls = useRef<string[]>([]);
  useEffect(() => {
    const urls = photoUrls.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);
  const [signed, setSigned] = useState(false);
  const [receiver, setReceiver] = useState("");
  const [busy, setBusy] = useState(false);
  if (!trip || !order) return <NotInRun />;
  const stop = trip.stops.find((s) => s.orderId === orderId)!;
  const o = net.outlets.get(order.outletId)!;
  const lines = linesFor(order);
  const ready = signed && receiver.trim().length > 1;

  const complete = async () => {
    setBusy(true);
    const service = net.allowance(order.brand, o.dockType);
    await d.record({
      id: newId(),
      vehicleId: d.vehicleId,
      kind: "delivered",
      orderId,
      at: demoStamp(stop.arrive, orderId, service),
      recordedAt: new Date().toISOString(),
      pod: { receivedBy: receiver.trim(), signed, photos: photos.length, lines: lines.map((l) => ({ skuId: l.skuId, name: l.name, planned: l.qty, delivered: qty[l.skuId] ?? l.qty })) },
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
          <h2 className="font-bold">Photos &amp; signature</h2>
          <div className="flex flex-wrap gap-2">
            {photos.map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt="Delivery photo" className="h-16 w-20 rounded-lg object-cover" />
            ))}
            <label className="flex h-16 w-20 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-line-strong text-primary transition-colors hover:border-primary hover:bg-primary-soft">
              {photos.length ? <Plus className="size-5" /> : <Camera className="size-5" />}
              <span className="text-[10px] font-semibold">Add photo</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const url = URL.createObjectURL(f);
                  photoUrls.current.push(url);
                  setPhotos((p) => [...p, url]);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
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
            {([["Signature", signed], ["Receiver’s name", receiver.trim().length > 1]] as const).map(([label, ok]) => (
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

function NotInRun() {
  return (
    <>
      <AppBar title="Stop not in your run" back="/driver" />
      <Empty icon={MapPinOff} title="This stop isn’t on your run">
        Dispatch may have moved it to another vehicle. Your current stops are on the Run tab.
      </Empty>
    </>
  );
}
