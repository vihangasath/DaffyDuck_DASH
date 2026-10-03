"use client";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, Crosshair, Maximize2, Minimize2, Minus, Plus, Route, WifiOff, X } from "lucide-react";
import { cx } from "@/components/ui";
import { net, outletName } from "@waypoint/core/reference";
import { DEPOT_LATLNG, outletLatLng, type LatLng } from "@waypoint/core/domain/geo";
import { fmtMin } from "@waypoint/core/domain/time";
import type { Depot } from "@waypoint/core/domain/types";

interface MapStop {
  orderId: string;
  outletId: string;
  arrive: number;
  done: boolean;
}

type L = typeof Leaflet;
type Role = "next" | "later";
interface View {
  remaining: MapStop[];
  nextId?: string;
  from: LatLng;
}
interface Live {
  L: L;
  map: Leaflet.Map;
  pins: Map<string, { m: Leaflet.Marker; role: Role }>;
  truck: Leaflet.Marker;
  depot: LatLng;
  route: Leaflet.Polyline;
  leg: Leaflet.Polyline;
  raf?: number;
  view?: View;
  reduced: boolean;
}

// OpenStreetMap standard tiles: free with attribution, no API key. Swap for a hosted tile service in production.
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
/** Leaflet draws its own SVG, so read the theme's action blue (light or driver-dark) when the map is built. */
const primary = () => (typeof window === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue("--color-primary").trim()) || "#1d5fd3";
const TRUCK_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>';

const posOf = (s: MapStop): LatLng => outletLatLng(net.outlets.get(s.outletId)!, outletName(s.outletId));

function pinIcon(L: L, n: number, role: Role) {
  const next = role === "next";
  const [w, h] = next ? [40, 52] : [30, 39];
  const fill = next ? "var(--color-primary)" : "#fff";
  const stroke = next ? "#fff" : "var(--color-navy)";
  const ink = next ? "#fff" : "var(--color-navy)";
  return L.divIcon({
    className: "wp-marker",
    iconSize: [w, h],
    iconAnchor: [w / 2, h - 1],
    html: `<div class="wp-pin${next ? " wp-pin-next" : ""}" style="width:${w}px;height:${h}px">${next ? '<span class="wp-pulse"></span>' : ""}<svg viewBox="0 0 34 44" width="${w}" height="${h}"><path d="M17 42.5s14-14 14-24.5A14 14 0 0 0 3 18c0 10.5 14 24.5 14 24.5z" fill="${fill}" stroke="${stroke}" stroke-width="2.4"/><text x="17" y="22.5" text-anchor="middle" font-size="13" font-weight="700" fill="${ink}" font-family="Inter, system-ui, sans-serif">${n}</text></svg></div>`,
  });
}

/** The last state this phone showed for a trip, so returning from a delivery can replay the move. */
const memoKey = (tripId: string) => `waypoint-map-${tripId}`;
function readMemo(tripId: string): { nextId?: string; from: LatLng } | null {
  try {
    const raw = sessionStorage.getItem(memoKey(tripId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeMemo(tripId: string, v: View) {
  try {
    sessionStorage.setItem(memoKey(tripId), JSON.stringify({ nextId: v.nextId, from: v.from }));
  } catch {
    /* private mode: the map still works, it just won't replay */
  }
}

export function RunMap({ tripId, depot, stops, nextId, online }: { tripId: string; depot: Depot; stops: MapStop[]; nextId?: string; online: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const live = useRef<Live | null>(null);
  const [ready, setReady] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [tilesDown, setTilesDown] = useState(false);
  const selRef = useRef(setSel);

  const sig = `${stops.map((s) => `${s.orderId}:${+s.done}`).join(",")}|${nextId}`;

  // Create the map once (Leaflet touches window, so it loads on the client only).
  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then(({ default: L }) => {
      if (cancelled || !el.current) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const touch = window.matchMedia("(pointer: coarse)").matches;
      // Compact card: one finger scrolls the page, not the map. Expanding unlocks full panning.
      const map = L.map(el.current, { zoomControl: false, scrollWheelZoom: false, dragging: !touch, zoomSnap: 0.25 });
      map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
      L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION })
        .on("tileerror", () => setTilesDown(true))
        .on("tileload", () => setTilesDown(false))
        .addTo(map);
      const home = DEPOT_LATLNG[depot];
      L.marker(home, { interactive: false, keyboard: false, icon: L.divIcon({ className: "wp-marker", iconSize: [26, 26], iconAnchor: [13, 13], html: '<div class="wp-depot"><span></span></div>' }) }).addTo(map);
      const route = L.polyline([], { color: primary(), weight: 4, opacity: 0.5, dashArray: "1 9", lineCap: "round", interactive: false }).addTo(map);
      const leg = L.polyline([], { color: primary(), weight: 5, opacity: 0.9, lineCap: "round", interactive: false }).addTo(map);
      const truck = L.marker(home, {
        interactive: false,
        keyboard: false,
        zIndexOffset: 1000,
        icon: L.divIcon({ className: "wp-marker", iconSize: [36, 36], iconAnchor: [18, 18], html: `<div class="wp-truck">${TRUCK_SVG}</div>` }),
      }).addTo(map);
      live.current = { L, map, pins: new Map(), truck, depot: home, route, leg, reduced };
      setReady(true);
    });
    return () => {
      cancelled = true;
      if (live.current) {
        cancelAnimationFrame(live.current.raf ?? 0);
        live.current.map.remove();
        live.current = null;
      }
    };
  }, [depot]);

  // Draw the run. On the first draw after a delivery, replay the previous state briefly, then move on.
  useEffect(() => {
    const s = live.current;
    if (!ready || !s) return;
    const now = viewOf(stops, nextId, depot);
    if (!s.view) {
      const memo = readMemo(tripId);
      const finished = memo?.nextId && memo.nextId !== now.nextId ? stops.find((x) => x.orderId === memo.nextId && x.done) : undefined;
      if (memo && finished && !s.reduced) {
        draw(s, stops, { remaining: [finished, ...now.remaining], nextId: finished.orderId, from: memo.from }, false, selRef);
        const t = setTimeout(() => {
          if (live.current === s) draw(s, stops, now, true, selRef);
          writeMemo(tripId, now);
        }, 900);
        return () => clearTimeout(t);
      }
      draw(s, stops, now, false, selRef);
    } else {
      draw(s, stops, now, true, selRef);
    }
    writeMemo(tripId, now);
    // `sig` captures every change that matters; `stops` itself is a new array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, sig, tripId]);

  // Expand to full screen: unlock gestures and lock the page behind it.
  useEffect(() => {
    const s = live.current;
    if (!ready || !s) return;
    const { map } = s;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (expanded) {
      map.dragging.enable();
      map.scrollWheelZoom.enable();
    } else {
      if (touch) map.dragging.disable();
      map.scrollWheelZoom.disable();
    }
    const prev = document.body.style.overflow;
    if (expanded) document.body.style.overflow = "hidden";
    const t = setTimeout(() => {
      map.invalidateSize();
      focus(s, "next", false);
    }, 60);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    window.addEventListener("keydown", esc);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", esc);
    };
  }, [expanded, ready]);

  const selected = sel ? stops.find((x) => x.orderId === sel && !x.done) : undefined;
  const selIndex = selected ? stops.indexOf(selected) : -1;
  const btn = "flex size-10 items-center justify-center rounded-xl bg-surface text-ink shadow-raised ring-1 ring-line transition-colors hover:bg-canvas active:translate-y-px";

  return (
    <section
      aria-label="Map of your stops"
      className={cx(
        "overflow-hidden bg-subtle",
        expanded ? "fixed inset-0 z-40 mx-auto max-w-md" : "relative h-[27vh] max-h-60 min-h-44 rounded-2xl shadow-card ring-1 ring-line",
      )}
    >
      <div ref={el} className="absolute inset-0 z-0" />

      <div className="pointer-events-none absolute inset-x-3 top-3 z-[500] flex items-start gap-2">
        {(!online || tilesDown) && (
          <span className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-warning px-2.5 py-1 text-xs font-semibold text-white shadow-raised">
            <WifiOff className="size-3.5" /> {tilesDown ? "No map tiles · pins still show your stops" : "No signal · pins saved on this phone"}
          </span>
        )}
        <div className="pointer-events-auto ml-auto grid gap-2">
          <button className={btn} aria-label={expanded ? "Close full-screen map" : "Open full-screen map"} onClick={() => setExpanded((x) => !x)}>
            {expanded ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
          </button>
          <button className={btn} aria-label="Centre on next stop" onClick={() => live.current && focus(live.current, "next", true)}>
            <Crosshair className="size-5" />
          </button>
          <button className={btn} aria-label="Show the whole run" onClick={() => live.current && focus(live.current, "all", true)}>
            <Route className="size-5" />
          </button>
          {expanded && (
            <>
              <button className={cx(btn, "mt-2")} aria-label="Zoom in" onClick={() => live.current?.map.zoomIn()}>
                <Plus className="size-5" />
              </button>
              <button className={btn} aria-label="Zoom out" onClick={() => live.current?.map.zoomOut()}>
                <Minus className="size-5" />
              </button>
            </>
          )}
        </div>
      </div>

      {selected ? (
        <div className="absolute inset-x-3 bottom-7 z-[500] flex animate-rise items-center gap-3 rounded-xl bg-surface p-3 shadow-float ring-1 ring-line">
          <span className={cx("flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold", selected.orderId === nextId ? "bg-primary text-on-primary" : "border-2 border-line-strong bg-subtle text-ink")}>{selIndex + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{outletName(selected.outletId)}</p>
            <p className="text-xs text-ink-2">
              {selected.orderId === nextId ? "Next stop · " : ""}ETA {fmtMin(selected.arrive)} · window {net.outlets.get(selected.outletId)!.windowOpen}–{net.outlets.get(selected.outletId)!.windowClose}
            </p>
          </div>
          <Link href={`/driver/stop/${selected.orderId}`} className="flex items-center gap-0.5 rounded-lg bg-primary-soft px-2.5 py-2 text-sm font-semibold text-primary-strong">
            Open <ChevronRight className="size-4" />
          </Link>
          <button aria-label="Close" onClick={() => setSel(null)} className="rounded-lg p-1.5 text-ink-2 hover:bg-subtle">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        !nextId && (
          <p className="absolute inset-x-3 bottom-7 z-[500] rounded-xl bg-navy px-3 py-2.5 text-center text-sm font-semibold text-white shadow-float">All stops done · head back to the depot</p>
        )
      )}
    </section>
  );
}

/** Where the truck is: the last finished stop in run order, or the depot before the first delivery. */
function viewOf(stops: MapStop[], nextId: string | undefined, depot: Depot): View {
  const lastDone = [...stops].reverse().find((s) => s.done);
  return { remaining: stops.filter((s) => !s.done), nextId, from: lastDone ? posOf(lastDone) : DEPOT_LATLNG[depot] };
}

function draw(s: Live, stops: MapStop[], v: View, animate: boolean, select: React.RefObject<(id: string) => void>) {
  const { L, map, pins } = s;
  const motion = animate && !s.reduced;
  const keep = new Set(v.remaining.map((r) => r.orderId));

  // Finished stops leave: the pin lifts and fades, then is removed.
  for (const [id, p] of pins) {
    if (keep.has(id)) continue;
    pins.delete(id);
    const pin = p.m.getElement()?.querySelector(".wp-pin");
    if (motion && pin) {
      pin.classList.add("wp-pin-out");
      setTimeout(() => p.m.remove(), 380);
    } else p.m.remove();
  }
  for (const r of v.remaining) {
    const role: Role = r.orderId === v.nextId ? "next" : "later";
    const n = stops.findIndex((x) => x.orderId === r.orderId) + 1;
    const ex = pins.get(r.orderId);
    if (ex?.role === role) continue;
    const icon = pinIcon(L, n, role);
    if (ex) {
      ex.m.setIcon(icon).setZIndexOffset(role === "next" ? 500 : 0);
      ex.role = role;
    } else {
      const m = L.marker(posOf(r), { icon, title: `Stop ${n}: ${outletName(r.outletId)}`, alt: `Stop ${n}`, riseOnHover: true, zIndexOffset: role === "next" ? 500 : 0 })
        .on("click", () => select.current(r.orderId))
        .addTo(map);
      pins.set(r.orderId, { m, role });
    }
  }

  const next = v.remaining.find((r) => r.orderId === v.nextId);
  s.route.setLatLngs(v.remaining.length ? [v.from, ...v.remaining.map(posOf)] : []);
  s.leg.setLatLngs([v.from, next ? posOf(next) : s.depot]);
  moveTruck(s, v.from, motion);

  const moved = s.view?.nextId !== v.nextId;
  s.view = v;
  if (moved || !animate) focus(s, "next", motion);
}

function focus(s: Live, what: "next" | "all", animate: boolean) {
  const v = s.view;
  if (!v) return;
  const next = v.remaining.find((r) => r.orderId === v.nextId);
  const pts: LatLng[] = what === "all" ? [v.from, ...v.remaining.map(posOf), s.depot] : [v.from, next ? posOf(next) : s.depot];
  const bounds = s.L.latLngBounds(pts);
  const opts = { padding: [56, 56] as [number, number], maxZoom: 15 };
  if (animate && !s.reduced) s.map.flyToBounds(bounds, { ...opts, duration: 1.1 });
  else s.map.fitBounds(bounds, opts);
}

function moveTruck(s: Live, to: LatLng, animate: boolean) {
  const start = s.truck.getLatLng();
  cancelAnimationFrame(s.raf ?? 0);
  if (!animate || (start.lat === to[0] && start.lng === to[1])) {
    s.truck.setLatLng(to);
    return;
  }
  const t0 = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / 1000);
    const e = 1 - Math.pow(1 - k, 3);
    s.truck.setLatLng([start.lat + (to[0] - start.lat) * e, start.lng + (to[1] - start.lng) * e]);
    if (k < 1) s.raf = requestAnimationFrame(step);
  };
  s.raf = requestAnimationFrame(step);
}
