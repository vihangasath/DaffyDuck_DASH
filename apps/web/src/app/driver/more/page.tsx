"use client";
import { useRouter } from "next/navigation";
import { LogOut, Phone, Truck, WifiOff } from "lucide-react";
import { useDriver } from "@/components/driver/driver-context";
import { AppBar, Button, Card, cx } from "@/components/ui";
import { setSimulatedOffline, simulatedOffline } from "@/lib/api/network";
import { depotName, net } from "@waypoint/core/reference";
import { readSession, signOut } from "@/lib/session";

export default function More() {
  const d = useDriver();
  const router = useRouter();
  const sim = !d.online && simulatedOffline();
  const s = readSession();
  const v = net.vehicles.get(d.vehicleId);
  return (
    <>
      <AppBar title="More" sub={s?.name} />
      <div className="grid gap-3 p-4">
        <a href="tel:+94112000001" className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 font-semibold shadow-card transition-colors hover:border-primary/40">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><Phone className="size-5" /></span> Call dispatch (Peliyagoda)
        </a>

        <Card className="grid gap-3 p-4">
          <div>
            <h2 className="font-bold">Demo: simulate a dead zone</h2>
            <p className="text-sm text-ink-2">Cuts this tab off from the server, like the Kadugannawa pass. Everything you record is kept on the phone and syncs when you switch it back.</p>
          </div>
          <button
            role="switch"
            aria-checked={sim}
            onClick={() => setSimulatedOffline(!sim)}
            className={cx("flex items-center justify-between rounded-xl border-2 p-3.5 text-left font-semibold transition-colors", sim ? "border-warning bg-warning-soft text-warning" : "border-line hover:border-line-strong")}
          >
            <span className="flex items-center gap-2"><WifiOff className="size-5" /> No signal</span>
            <span className={cx("flex h-7 w-12 items-center rounded-full p-0.5 transition-colors", sim ? "bg-warning" : "bg-line-strong")}>
              <span className={cx("size-6 rounded-full bg-white shadow-card transition-transform duration-200 ease-out", sim && "translate-x-5")} />
            </span>
          </button>
        </Card>

        <Card className="flex items-center gap-3 p-4">
          <span className="flex size-10 items-center justify-center rounded-xl bg-navy text-mint"><Truck className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">{d.vehicleId}</p>
            <p className="text-sm text-ink-2">
              {v ? `${v.temp === "reefer" ? "Refrigerated" : "Dry-box"} ${v.type}${v.plateNo ? ` · ${v.plateNo}` : ""} · ${depotName(v.depot)}` : "Assigned vehicle"}
            </p>
          </div>
        </Card>
        <p className="px-1 text-xs text-ink-2">Dispatch assigns your vehicle. If it’s wrong, call them.</p>

        <Button
          big
          kind="secondary"
          icon={LogOut}
          onClick={async () => {
            await signOut();
            router.replace("/");
          }}
        >
          Sign out
        </Button>
      </div>
    </>
  );
}
