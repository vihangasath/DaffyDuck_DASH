"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Camera, Check, PenLine } from "lucide-react";
import { Button, Card, Pill, Spinner, Stepper, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { outletName } from "@waypoint/core/reference";
import { useAct, useDb } from "@/lib/hooks";
import { useSession } from "@/lib/session";

const ISSUES = ["Damaged", "Temperature", "Wrong item", "Missing"];

export default function Receipt() {
  const { orderId } = useParams<{ orderId: string }>();
  const { data: db } = useDb();
  const [session] = useSession();
  const router = useRouter();
  const { run, busy } = useAct();
  const [recv, setRecv] = useState<Record<string, number>>({});
  const [issues, setIssues] = useState<string[]>([]);
  const [note, setNote] = useState("");
  if (!db) return <Spinner />;
  const stop = db.stops[orderId];
  const order = db.orders.find((o) => o.id === orderId);
  if (!stop?.pod || !order) return <p className="p-6">No proof of delivery yet for this order. <Link href="/store" className="text-primary">Back</Link></p>;
  const pod = stop.pod;
  const done = db.receipts[orderId];

  return (
    <div className="mx-auto grid max-w-2xl gap-4 p-4 sm:p-7">
      <div className="flex items-center gap-3">
        <Link href="/store" aria-label="Back" className="-ml-1.5 flex size-10 items-center justify-center rounded-xl transition-colors hover:bg-subtle"><ArrowLeft className="size-6" /></Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Confirm receipt</h1>
          <p className="text-sm text-ink-2">{order.id} · {outletName(order.outletId)} · delivered {stop.deliveredAt}</p>
        </div>
      </div>
      <Card className="flex items-center gap-4 p-4">
        <span className="flex size-14 items-center justify-center rounded-xl bg-navy text-mint"><Camera className="size-6" /></span>
        <div className="text-sm">
          <p className="font-bold">Driver’s proof of delivery</p>
          <p className="text-ink-2">{stop.vehicleId} · {pod.photos} photo{pod.photos === 1 ? "" : "s"} · <PenLine className="inline size-3.5" /> signed by {pod.receivedBy} at {stop.deliveredAt}</p>
        </div>
      </Card>
      <Card className="grid gap-1 p-4">
        <h2 className="mb-1 font-bold">Check what arrived</h2>
        {pod.lines.map((l) => {
          const r = recv[l.skuId] ?? l.delivered;
          const tone = r < l.delivered ? "danger" : l.delivered < l.planned ? "warning" : "success";
          return (
            <div key={l.skuId} className="flex flex-wrap items-center gap-3 border-t border-line py-2.5 first:border-0">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{l.name}</p>
                <p className="text-xs text-ink-2">Ordered {l.planned} · driver recorded {l.delivered}</p>
              </div>
              <Pill tone={tone}>{r < l.delivered ? `You counted ${l.delivered - r} fewer` : l.delivered < l.planned ? `Short ${l.planned - l.delivered} · matches driver` : "Match"}</Pill>
              <Stepper value={r} max={l.planned} onChange={(v) => setRecv((s) => ({ ...s, [l.skuId]: v }))} />
            </div>
          );
        })}
      </Card>
      <Card className="grid gap-3 p-4">
        <h2 className="font-bold">Anything else wrong?</h2>
        <div className="flex flex-wrap gap-2">
          {ISSUES.map((i) => (
            <button key={i} aria-pressed={issues.includes(i)} onClick={() => setIssues((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]))} className={cx("rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors", issues.includes(i) ? "border-danger bg-danger-soft text-danger" : "border-line-strong hover:border-ink-2/40 hover:bg-canvas")}>
              {i}
            </button>
          ))}
        </div>
        {issues.length > 0 && <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Describe the issue for dispatch" className="rounded-xl border border-line-strong px-3 py-2.5 shadow-card focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15" />}
      </Card>
      {done ? (
        <p className="flex items-center gap-2 rounded-xl bg-success-soft p-4 font-semibold text-success"><Check className="size-5" /> Receipt confirmed</p>
      ) : (
        <Button
          big
          icon={Check}
          busy={busy}
          onClick={async () => {
            const lines = pod.lines.map((l) => ({ skuId: l.skuId, name: l.name, driverQty: l.delivered, receivedQty: recv[l.skuId] ?? l.delivered }));
            const counted = lines.filter((l) => l.receivedQty < l.driverQty).map((l) => ({ type: "Count differs from driver", note: `${l.name}: ${l.receivedQty} vs ${l.driverQty}` }));
            const r = await run(() => api.confirmReceipt({ orderId, by: session?.name ?? "Store", lines, issues: [...issues.map((type) => ({ type, note: note || undefined })), ...counted] }).then(() => true), "Receipt confirmed");
            if (r) router.push("/store");
          }}
        >
          Confirm receipt{issues.length ? ` (${issues.length} issue${issues.length > 1 ? "s" : ""})` : ""}
        </Button>
      )}
    </div>
  );
}
