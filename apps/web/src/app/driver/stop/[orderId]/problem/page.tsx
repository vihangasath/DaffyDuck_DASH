"use client";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Phone, Thermometer, MapPinOff } from "lucide-react";
import { useDriver } from "@/components/driver/driver-context";
import { DriverSync, OfflineBanner } from "@/components/driver/bits";
import { AppBar, Button, btnClass, cx, Empty } from "@/components/ui";
import { toast } from "@/components/toast";
import { outletName } from "@waypoint/core/reference";
import { newId } from "@/lib/offline/outbox";
import { demoStamp } from "@waypoint/core/views";

const REASONS = ["Store closed / no receiver", "Access blocked (parking, mall bay)", "Refused — temperature or quality", "Vehicle problem", "Other"];

export default function Problem() {
  const { orderId } = useParams<{ orderId: string }>();
  const d = useDriver();
  const router = useRouter();
  const [reason, setReason] = useState(REASONS[0]);
  const [temp, setTemp] = useState("");
  const [note, setNote] = useState("");
  const trip = d.trips.find((t) => t.stops.some((s) => s.orderId === orderId));
  if (!trip) return <NotInRun />;
  const stop = trip.stops.find((s) => s.orderId === orderId)!;
  const refused = reason.startsWith("Refused");
  const tempC = temp ? Number(temp) : undefined;

  return (
    <>
      <AppBar back={`/driver/stop/${orderId}`} title="Can’t complete stop" sub={`${outletName(stop.outletId)} · ${stop.outletId}`} right={<DriverSync />} />
      <OfflineBanner />
      <div className="grid gap-2.5 p-4">
        <h2 className="text-base font-bold">What happened?</h2>
        <div role="radiogroup" className="grid gap-2">
          {REASONS.map((r) => (
            <button key={r} role="radio" aria-checked={r === reason} onClick={() => setReason(r)} className={cx("flex items-center gap-3 rounded-xl border p-4 text-left text-[15px] transition-[border-color,background-color,box-shadow] duration-150", r === reason ? "border-primary bg-primary-soft font-semibold ring-2 ring-primary/25" : "border-line bg-surface shadow-card hover:border-line-strong")}>
              <span className={cx("flex size-[22px] shrink-0 items-center justify-center rounded-full border-2", r === reason ? "border-primary" : "border-line-strong")}>{r === reason && <span className="size-2.5 rounded-full bg-primary" />}</span>
              {r}
            </button>
          ))}
        </div>
        {refused && (
          <label className="grid gap-1.5 text-sm font-semibold text-ink-2">
            Probe temperature (°C)
            <span className={cx("flex items-center gap-2 rounded-xl border-2 bg-surface px-3", tempC != null && tempC > 5 ? "border-danger" : "border-line-strong")}>
              <Thermometer className="size-5 text-muted" />
              <input inputMode="decimal" value={temp} onChange={(e) => setTemp(e.target.value)} placeholder="e.g. 9.4" className="w-full bg-transparent py-3 text-base font-normal text-ink outline-none" />
            </span>
            {tempC != null && tempC > 5 && <span className="text-xs font-medium text-danger">Above the 5 °C limit for chilled dairy</span>}
          </label>
        )}
        <label className="grid gap-1.5 text-sm font-semibold text-ink-2">
          Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} className="rounded-xl border border-line-strong bg-surface px-3 py-3 text-base font-normal text-ink shadow-card focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15" />
        </label>
        <Button
          big
          kind="danger"
          icon={AlertTriangle}
          onClick={async () => {
            await d.record({ id: newId(), vehicleId: d.vehicleId, kind: "problem", orderId, at: demoStamp(stop.arrive, orderId), recordedAt: new Date().toISOString(), problem: { reason, tempC, note: note || undefined } });
            toast.success(d.online ? "Reported to dispatch" : "Saved — dispatch is told when you’re back in coverage");
            router.push("/driver");
          }}
        >
          Report to dispatcher
        </Button>
        <a href="tel:+94112000001" className={cx(btnClass("secondary"), "min-h-12 rounded-xl text-base")}>
          <Phone className="size-5" /> Call dispatcher
        </a>
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
