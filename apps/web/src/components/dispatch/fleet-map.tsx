"use client";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { useEffect, useRef, useState } from "react";
import { LocateFixed, MapPinOff } from "lucide-react";
import { Card } from "@/components/ui";
import type { Position } from "@/lib/api";
import { DEPOT_LATLNG } from "@waypoint/core/domain/geo";
import type { Depot } from "@waypoint/core/domain/types";

export interface FleetDot {
  vehicleId: string;
  position: Position;
  trail: Position[];
  /** Short status for the label ("Next: Kiribathgoda"). */
  note: string;
  alert?: boolean;
}

const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
/** A fix older than this is drawn faded: the phone has not reported for a while. */
const STALE_MS = 3 * 60_000;
const TRUCK_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>';
/** Leaflet draws SVG attributes, which can't read CSS variables: resolve the theme's blue once. */
const primary = () => (typeof window === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue("--color-primary").trim()) || "#1d5fd3";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const ago = (iso: string, now: number) => {
  const m = Math.round((now - Date.parse(iso)) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ago`;
};

interface Live {
  L: typeof Leaflet;
  map: Leaflet.Map;
  layers: Map<string, { m: Leaflet.Marker; acc: Leaflet.Circle; trail: Leaflet.Polyline }>;
  fitted: boolean;
}

/** Where each vehicle's phone last said it was, with a short trail. Positions come with the driver app's sync. */
export function FleetMap({ depot, dots, now }: { depot: Depot; dots: FleetDot[]; now: number }) {
  const el = useRef<HTMLDivElement>(null);
  const live = useRef<Live | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let dead = false;
    void import("leaflet").then(({ default: L }) => {
      if (dead || !el.current || live.current) return;
      const map = L.map(el.current, { zoomControl: true, scrollWheelZoom: false, zoomSnap: 0.25 }).setView(DEPOT_LATLNG[depot], 10);
      L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
      L.marker(DEPOT_LATLNG[depot], { interactive: false, keyboard: false, icon: L.divIcon({ className: "wp-marker", iconSize: [26, 26], iconAnchor: [13, 13], html: '<div class="wp-depot"><span></span></div>' }) }).addTo(map);
      live.current = { L, map, layers: new Map(), fitted: false };
      setReady(true);
    });
    return () => {
      dead = true;
      live.current?.map.remove();
      live.current = null;
    };
    // The map is built once per depot.
  }, [depot]);

  useEffect(() => {
    const s = live.current;
    if (!ready || !s) return;
    const { L, map, layers } = s;
    const seen = new Set<string>();
    for (const d of dots) {
      seen.add(d.vehicleId);
      const at: Leaflet.LatLngExpression = [d.position.lat, d.position.lng];
      const stale = now - Date.parse(d.position.at) > STALE_MS;
      const icon = L.divIcon({
        className: "wp-marker",
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        html: `<div class="wp-fleet${stale ? " wp-stale" : ""}${d.alert ? " wp-alert" : ""}"><div class="wp-truck">${TRUCK_SVG}</div><span>${esc(d.vehicleId)}</span></div>`,
      });
      const tip = `<b>${esc(d.vehicleId)}</b><br>${esc(d.note)}<br>Phone location ${ago(d.position.at, now)} · ±${d.position.accuracyM} m`;
      const line = d.trail.map((p) => [p.lat, p.lng] as Leaflet.LatLngTuple);
      const cur = layers.get(d.vehicleId);
      if (cur) {
        cur.m.setLatLng(at).setIcon(icon).setTooltipContent(tip);
        cur.acc.setLatLng(at).setRadius(d.position.accuracyM);
        cur.trail.setLatLngs(line);
      } else {
        const trail = L.polyline(line, { color: primary(), weight: 3, opacity: 0.45, dashArray: "2 6", lineCap: "round" }).addTo(map);
        const acc = L.circle(at, { radius: d.position.accuracyM, color: primary(), weight: 1, opacity: 0.4, fillOpacity: 0.08, interactive: false }).addTo(map);
        const m = L.marker(at, { icon, title: d.vehicleId, keyboard: true }).bindTooltip(tip, { direction: "top", offset: [0, -16] }).addTo(map);
        layers.set(d.vehicleId, { m, acc, trail });
      }
    }
    for (const [vid, l] of layers) {
      if (seen.has(vid)) continue;
      l.m.remove();
      l.acc.remove();
      l.trail.remove();
      layers.delete(vid);
    }
    if (!s.fitted && dots.length) {
      fit(s, dots, depot);
      s.fitted = true;
    }
  }, [dots, ready, now, depot]);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 pb-2 pt-3">
        <h2 className="font-bold">Vehicle positions</h2>
        <span className="text-[11px] text-muted">From each driver’s phone with every sync; faded when older than {STALE_MS / 60_000} min</span>
        {dots.length > 0 && (
          <button onClick={() => live.current && fit(live.current, dots, depot)} className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary-soft">
            <LocateFixed className="size-3.5" /> Show all
          </button>
        )}
      </div>
      <div className="relative">
        <div ref={el} className="h-[320px] w-full" role="region" aria-label={`Map of ${dots.length} vehicle position${dots.length === 1 ? "" : "s"}`} />
        {!dots.length && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[500] mx-auto flex w-fit items-center gap-2 rounded-full bg-surface/95 px-3.5 py-2 text-xs font-semibold text-ink-2 shadow-card ring-1 ring-line">
            <MapPinOff className="size-4" /> No phone locations yet. Drivers share theirs from the app once they have a run.
          </div>
        )}
      </div>
    </Card>
  );
}

function fit(s: Live, dots: FleetDot[], depot: Depot) {
  const pts = [DEPOT_LATLNG[depot], ...dots.map((d) => [d.position.lat, d.position.lng] as [number, number])];
  s.map.fitBounds(s.L.latLngBounds(pts), { padding: [36, 36], maxZoom: 15 });
}
