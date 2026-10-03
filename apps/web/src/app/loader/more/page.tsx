"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Download, LogOut, RefreshCw, Smartphone, Warehouse, WifiOff } from "lucide-react";
import { AppBar, Button, Card, cx } from "@/components/ui";
import { LoaderSync } from "@/components/loader/bits";
import { ThemePicker, ThemeToggle } from "@/components/theme-controls";
import { useLoader } from "@/components/loader/loader-context";
import { setSimulatedOffline, simulatedOffline } from "@/lib/api/network";
import { useOnline } from "@/lib/hooks";
import { readSession, signOut } from "@/lib/session";

/** Chrome/Android offers installation through this event; iOS uses Share → Add to Home Screen. */
type InstallPrompt = Event & { prompt: () => Promise<void> };

export default function More() {
  const d = useLoader();
  const online = useOnline();
  const router = useRouter();
  const sim = !online && simulatedOffline();
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
  const saved = d.savedAt ? new Date(d.savedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : null;

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

        <Card className="grid gap-3 p-4">
          <div>
            <h2 className="font-bold">Demo: simulate a dead spot</h2>
            <p className="text-sm text-ink-2">Cuts this tab off from the server, like the back of the cold store. Keep ticking; it all sends when you switch it back.</p>
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
