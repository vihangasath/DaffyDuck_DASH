"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ClipboardCheck, Info, MapPin, Navigation, Package, Phone, Snowflake, Truck, User } from "lucide-react";
import { useDriver } from "@/components/driver/driver-context";
import { DriverSync, NotInRun, OfflineBanner } from "@/components/driver/bits";
import { AppBar, Button, Card, Kv, Pill, btnClass, cx } from "@/components/ui";
import { toast } from "@/components/toast";
import { net, outletName } from "@waypoint/core/reference";
import { linesFor } from "@waypoint/core/domain/catalog";
import { fmtMin } from "@waypoint/core/domain/time";
import { newId } from "@/lib/offline/outbox";
import { demoStamp, mapsUrl } from "@waypoint/core/views";
import { CALL } from "@/lib/contacts";

const ACCESS: Record<string, string> = {
  rear_dock: "Rear loading dock — reverse in; ring the receiving bell.",
  street: "Kerbside unloading — use hazard lights and a trolley; keep the footpath clear.",
  mall_bay: "Shared mall loading bay — show the Waypoint delivery pass at the security gate.",
};

export default function StopDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const d = useDriver();
  const router = useRouter();
  const trip = d.trips.find((t) => t.stops.some((s) => s.orderId === orderId));
  if (!trip) return <NotInRun />;
  const stop = trip.stops.find((s) => s.orderId === orderId)!;
  const order = trip.orders.find((o) => o.id === orderId)!;
  const o = net.outlets.get(order.outletId)!;
  const rec = d.stops[orderId];

  return (
    <>
      <AppBar back="/driver" title={`Stop ${stop.seq + 1} of ${trip.stops.length}`} sub={`${o.id} · ${o.brand} · ${outletName(o.id)}`} right={<DriverSync />} />
      <OfflineBanner />
      <div className="grid gap-3 p-4">
        <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
          <Kv big k="Window" v={o.mallWindow ? `Mall ${o.mallWindow}` : `${o.windowOpen}–${o.windowClose}`} />
          <Kv big k="ETA" v={fmtMin(stop.arrive)} />
          {rec?.deliveredAt ? <Pill tone="success" lg>Delivered {rec.deliveredAt}</Pill> : rec?.arrivedAt ? <Pill tone="info" lg>Arrived {rec.arrivedAt}</Pill> : <Pill tone="success" dot lg>On time</Pill>}
        </Card>
        <Card className="grid gap-2.5 p-4">
          <h2 className="font-bold">Access &amp; unloading</h2>
          <Row icon={Truck}>{ACCESS[o.dockType]}</Row>
          {o.parking === "van_only" && <Row icon={AlertTriangle}>Narrow lane — trucks cannot reach this outlet.</Row>}
          {o.mallWindow && <Row icon={Info}>Mall bay accepts deliveries only {o.mallWindow}.</Row>}
          <Row icon={User}>Receiver: store manager or shift lead from {o.windowOpen}</Row>
        </Card>
        <Card className="grid gap-2 p-4">
          <h2 className="font-bold">Unload here</h2>
          {linesFor(order).map((l) => (
            <div key={l.skuId} className="flex items-center gap-2.5">
              {order.temp === "chilled" ? <Snowflake className="size-[18px] text-chilled" /> : <Package className="size-[18px] text-muted" />}
              <span className="flex-1 text-[15px]">{l.name} <span className="text-xs text-muted">· {l.unit}</span></span>
              <b className="tabular-nums">×{l.qty}</b>
            </div>
          ))}
        </Card>
        <div className="grid grid-cols-2 gap-2.5">
          <a href={mapsUrl(o.id)} target="_blank" rel="noreferrer" className={cx(btnClass("secondary"), "min-h-12 rounded-xl text-base")}>
            <Navigation className="size-5" /> Navigate
          </a>
          <a href={CALL.store} className={cx(btnClass("secondary"), "min-h-12 rounded-xl text-base")}>
            <Phone className="size-5" /> Call store
          </a>
        </div>
        {!rec?.deliveredAt && !rec?.problem && (
          <div className="grid gap-2">
            {!rec?.arrivedAt && (
              <Button
                big
                kind="secondary"
                icon={MapPin}
                onClick={async () => {
                  await d.record({ id: newId(), vehicleId: d.vehicleId, kind: "arrived", orderId, at: demoStamp(stop.arrive, orderId), recordedAt: new Date().toISOString() });
                  toast.success(d.online ? "Arrival recorded" : "Arrival saved on this phone");
                }}
              >
                I’ve arrived
              </Button>
            )}
            <Button big icon={ClipboardCheck} onClick={() => router.push(`/driver/stop/${orderId}/pod`)}>Start delivery &amp; POD</Button>
            <Link href={`/driver/stop/${orderId}/problem`} className="rounded-xl py-3 text-center font-semibold text-danger transition-colors hover:bg-danger-soft">Can’t deliver…</Link>
          </div>
        )}
      </div>
    </>
  );
}

function Row({ icon: Icon, children }: { icon: typeof Truck; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 text-[15px] leading-snug [&>span:last-child]:pt-0.5">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-subtle text-ink-2"><Icon className="size-4" /></span>
      <span>{children}</span>
    </p>
  );
}
