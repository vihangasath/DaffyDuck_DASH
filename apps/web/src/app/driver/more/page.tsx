"use client";
import { LocateFixed, Phone, Truck } from "lucide-react";
import { useDriver } from "@/components/driver/driver-context";
import { AppBar, Card, cx } from "@/components/ui";
import { ThemePicker, ThemeToggle } from "@/components/theme-controls";
import { SignOutButton, SimulateOffline, SwitchRow } from "@/components/phone";
import { depotName, net } from "@waypoint/core/reference";
import { readSession } from "@/lib/session";
import { fmtClock } from "@waypoint/core/domain/time";
import { CALL } from "@/lib/contacts";

export default function More() {
  const d = useDriver();
  const s = readSession();
  const v = net.vehicles.get(d.vehicleId);
  return (
    <>
      <AppBar title="More" sub={s?.name} right={<ThemeToggle app="driver" />} />
      <div className="grid gap-3 p-4">
        <ThemePicker app="driver" why="Dim the screen for dawn runs, night shifts and reduced cab glare." />

        <a href={CALL.dispatch} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 font-semibold shadow-card transition-colors hover:border-primary/40">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><Phone className="size-5" /></span> Call dispatch (Peliyagoda)
        </a>

        <LocationCard />

        <SimulateOffline title="Demo: simulate a dead zone">
          Cuts this tab off from the server, like the Kadugannawa pass. Everything you record is kept on the phone and syncs when you switch it back.
        </SimulateOffline>

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

        <SignOutButton />
      </div>
    </>
  );
}

const STATUS: Record<string, string> = {
  off: "Off. Dispatch can’t see where the vehicle is.",
  idle: "Starts when you have a run for today.",
  asking: "Waiting for the phone to allow location…",
  on: "Sent to dispatch with every sync (every 20 s while you have signal).",
  denied: "This phone blocked location for DASH. Allow it in the browser’s site settings, then switch it on again.",
  unavailable: "The phone can’t get a location right now. It keeps trying.",
};

/** Share the phone's location with dispatch: whatever the phone can tell (GPS, Wi-Fi or cell towers). */
function LocationCard() {
  const { location: l } = useDriver();
  return (
    <Card className="grid gap-3 p-4">
      <div>
        <h2 className="font-bold">Share location with dispatch</h2>
        <p className="text-sm text-ink-2">Uses this phone’s location while you have a run. How exact it is depends on the phone and where you are.</p>
      </div>
      <SwitchRow checked={l.sharing} onChange={l.setSharing} icon={LocateFixed}>Location sharing</SwitchRow>
      <p className={cx("text-sm", l.status === "denied" ? "font-semibold text-danger" : "text-ink-2")}>
        {STATUS[l.status]}
        {l.status === "on" && l.fix && ` Last fix ${fmtClock(l.fix.at)}, accurate to about ${l.fix.accuracyM} m.`}
      </p>
    </Card>
  );
}
