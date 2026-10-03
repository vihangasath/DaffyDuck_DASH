"use client";
import { useEffect, useState } from "react";
import { Download, RefreshCw, Smartphone, Warehouse } from "lucide-react";
import { AppBar, Button, Card } from "@/components/ui";
import { LoaderSync } from "@/components/loader/bits";
import { ThemePicker, ThemeToggle } from "@/components/theme-controls";
import { useLoader } from "@/components/loader/loader-context";
import { SignOutButton, SimulateOffline } from "@/components/phone";
import { readSession } from "@/lib/session";
import { fmtClock } from "@waypoint/core/domain/time";

/** Chrome/Android offers installation through this event; iOS uses Share → Add to Home Screen. */
type InstallPrompt = Event & { prompt: () => Promise<void> };

export default function More() {
  const d = useLoader();
  const s = readSession();
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [installed] = useState(() => typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches);
  useEffect(() => {
    const on = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", on);
    return () => window.removeEventListener("beforeinstallprompt", on);
  }, []);
  const saved = d.savedAt ? fmtClock(d.savedAt) : null;

  return (
    <>
      <AppBar title="More" sub={s?.name} right={<span className="flex items-center gap-2"><ThemeToggle app="loader" /><LoaderSync /></span>} />
      <div className="grid gap-3 p-4">
        <Card className="flex items-center gap-3 p-4">
          <span className="flex size-10 items-center justify-center rounded-xl bg-navy [.dark_&]:bg-navy-3 text-mint"><Warehouse className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">{s?.depot ?? "Peliyagoda"} dock</p>
            <p className="text-sm text-ink-2">Loader · {s?.name}</p>
          </div>
        </Card>

        <ThemePicker app="loader" why="Easier on the eyes for the 02:00 Fresh wave and dim corners of the cold store. System follows your phone." />

        <Card className="grid gap-3 p-4">
          <div>
            <h2 className="font-bold">Connection</h2>
            <p className="text-sm text-ink-2">
              {d.connected ? "Connected." : "No connection."} {d.queued ? `${d.queued} tick${d.queued > 1 ? "s" : ""} waiting to send.` : "Every tick is sent."}
              {saved ? ` Dock list saved on this phone at ${saved}.` : ""}
            </p>
          </div>
          <Button kind="secondary" icon={RefreshCw} busy={d.syncing} disabled={!d.connected || !d.queued} onClick={() => d.flush()}>Send now</Button>
          <p className="text-xs text-ink-2">Ticks are kept on the phone first and sent in order, so a dead spot on the dock never loses one. Flagging and release need a connection, because dispatch and the store are told straight away.</p>
        </Card>

        <Card className="grid gap-3 p-4">
          <div>
            <h2 className="flex items-center gap-2 font-bold"><Smartphone className="size-4" /> DASH on your phone</h2>
            <p className="text-sm text-ink-2">
              {installed ? "Installed: DASH opens full-screen from your home screen." : "Install DASH to open it from your home screen, full-screen, like any other app. On iPhone: Share → Add to Home Screen."}
            </p>
          </div>
          {install && !installed && (
            <Button icon={Download} onClick={async () => { await install.prompt(); setInstall(null); }}>Install app</Button>
          )}
        </Card>

        <SimulateOffline title="Demo: simulate a dead spot">
          Cuts this tab off from the server, like the back of the cold store. Keep ticking; it all sends when you switch it back.
        </SimulateOffline>

        <SignOutButton />
      </div>
    </>
  );
}
