"use client";
import { liveQuery } from "dexie";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type DriverEvent, type Position, type StopRecord, type SyncExtras } from "@/lib/api";
import { isOnline, OfflineError } from "@/lib/api/network";
import { useDb, useOnline } from "@/lib/hooks";
import { driverDb, enqueue, newId, type NetRow, type OutboxRow, type PhotoRow, type RunSnapshot } from "@/lib/offline/outbox";
import { depotOfVehicle, vehicleTrips } from "@waypoint/core/views";
import type { TripEval } from "@waypoint/core/planner/evaluate";
import type { Db } from "@/lib/api";

const loadedOf = (db: Db, trips: TripEval[]) =>
  Object.fromEntries(trips.flatMap((t) => Object.entries(db.loads[t.trip.id]?.lines ?? {}).map(([k, l]) => [k, l.loaded] as const)));

interface LocalStop extends Partial<StopRecord> {
  pending?: boolean;
}

interface RunChange {
  removed: string[];
  added: string[];
  at: string;
}

/** Phone location sharing: browser geolocation (GPS, Wi-Fi or cell; whatever the phone has). */
interface LocationState {
  sharing: boolean;
  /** idle = sharing is on but there is no run to share it for yet. */
  status: "off" | "idle" | "asking" | "on" | "denied" | "unavailable";
  fix?: Position;
  setSharing: (on: boolean) => void;
}

const SHARE_KEY = "waypoint-share-location";
/** A fix older than this is not sent: dispatch would see the vehicle somewhere it left long ago. */
const FIX_MAX_AGE_MS = 5 * 60_000;

interface DriverCtx {
  vehicleId: string;
  online: boolean;
  syncing: boolean;
  fromCache: boolean;
  savedAt?: string;
  trips: TripEval[];
  published: boolean;
  stops: Record<string, LocalStop>;
  loadStatus: Record<string, string>;
  loaded: Record<string, number>;
  rows: OutboxRow[];
  photos: PhotoRow[];
  /** Connectivity changes this phone has seen, newest first. */
  netlog: NetRow[];
  queued: number;
  /** Photos still on this phone, waiting to upload. */
  photosQueued: number;
  /** Records the server refused; the driver needs to see them (and call dispatch). */
  rejected: number;
  lastSyncAt?: string;
  record: (e: DriverEvent) => Promise<void>;
  /** Keeps a photo on the phone (it uploads with the next sync) and returns its id. */
  addPhoto: (orderId: string, blob: Blob) => Promise<string>;
  flush: () => Promise<void>;
  change: RunChange | null;
  ackChange: () => void;
  location: LocationState;
}

const Ctx = createContext<DriverCtx | null>(null);
export const useDriver = () => useContext(Ctx)!;

export function DriverProvider({ vehicleId, children }: { vehicleId: string; children: ReactNode }) {
  const online = useOnline();
  const { data: db } = useDb();
  const [rows, setRows] = useState<OutboxRow[]>([]);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [netlog, setNetlog] = useState<NetRow[]>([]);
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string>();
  const [change, setChange] = useState<RunChange | null>(() => {
    try {
      const raw = typeof window === "undefined" ? null : localStorage.getItem(`waypoint-run-change-${vehicleId}`);
      return raw ? (JSON.parse(raw) as RunChange) : null;
    } catch {
      return null;
    }
  });
  const flushing = useRef(false);

  // Live view of the outbox and cached run.
  useEffect(() => {
    const a = liveQuery(() => driverDb().outbox.where("vehicleId").equals(vehicleId).sortBy("createdAt")).subscribe({ next: setRows });
    const b = liveQuery(() => driverDb().snapshot.get(vehicleId)).subscribe({ next: (s) => setSnapshot(s ?? null) });
    const c = liveQuery(() => driverDb().photos.where("vehicleId").equals(vehicleId).sortBy("createdAt")).subscribe({ next: setPhotos });
    const n = liveQuery(() => driverDb().netlog.where("vehicleId").equals(vehicleId).reverse().sortBy("at")).subscribe({ next: setNetlog });
    return () => {
      a.unsubscribe();
      b.unsubscribe();
      c.unsubscribe();
      n.unsubscribe();
    };
  }, [vehicleId]);

  // Connectivity log: a row each time the app loses or regains the server (no signal, or a dead request).
  const linkKey = `waypoint-link-${vehicleId}`;
  const link = useCallback(
    async (state: NetRow["state"]) => {
      let last: string | null = null;
      try {
        last = localStorage.getItem(linkKey);
        if (last === state) return;
        localStorage.setItem(linkKey, state);
      } catch {}
      // The very first reading is a starting point, not a change.
      if (last === null && state === "online") return;
      await driverDb().netlog.put({ id: newId(), vehicleId, state, at: new Date().toISOString(), sent: 0 });
    },
    [linkKey, vehicleId],
  );
  useEffect(() => {
    if (!online) void link("offline");
  }, [online, link]);

  // Location: watch while sharing is on and there is a run to drive; the heartbeat sends the latest fix.
  const [sharing, setSharingState] = useState(() => {
    try {
      return typeof window === "undefined" || localStorage.getItem(SHARE_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [geo, setGeo] = useState<{ fix?: Position; error?: "denied" | "unavailable" }>({});
  const fixRef = useRef<Position | undefined>(undefined);
  const hasRun = !!db?.plans[depotOfVehicle(vehicleId)]?.trips.some((t) => t.vehicleId === vehicleId);
  const watching = sharing && (hasRun || !!snapshot?.trips.length);
  const canLocate = typeof navigator !== "undefined" && !!navigator.geolocation;
  useEffect(() => {
    if (!watching || !canLocate) {
      fixRef.current = undefined;
      return;
    }
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        const fix: Position = { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy), at: new Date(p.timestamp || Date.now()).toISOString() };
        fixRef.current = fix;
        setGeo({ fix });
      },
      (err) => setGeo((g) => ({ fix: g.fix, error: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable" })),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [watching, canLocate]);
  const setSharing = useCallback((on: boolean) => {
    try {
      localStorage.setItem(SHARE_KEY, on ? "1" : "0");
    } catch {}
    setSharingState(on);
    setGeo({});
  }, []);
  const geoStatus: LocationState["status"] = !sharing ? "off" : !watching ? "idle" : !canLocate ? "unavailable" : geo.error === "denied" ? "denied" : geo.fix ? "on" : geo.error ?? "asking";

  // The sync check covers records synced since the current plan went out; until the phone knows which
  // plan that is, it sends no check (an old day's records must never be replayed as "missing").
  const publishedAt = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (db) publishedAt.current = db.plans[depotOfVehicle(vehicleId)]?.publishedAt;
  }, [db, vehicleId]);

  // While online, keep the cached run fresh and notice plan changes made while we were away.
  useEffect(() => {
    if (!online || !db) return;
    const plan = db.plans[depotOfVehicle(vehicleId)];
    const trips = vehicleTrips(db, vehicleId);
    const ids = new Set(trips.flatMap((t) => t.trip.orderIds));
    const next: RunSnapshot = {
      vehicleId,
      planVersion: plan?.version ?? 0,
      savedAt: new Date().toISOString(),
      trips,
      stops: Object.fromEntries(Object.entries(db.stops).filter(([id]) => ids.has(id))),
      loadStatus: Object.fromEntries(trips.map((t) => [t.trip.id, db.loads[t.trip.id]?.status ?? "not_started"])),
      loaded: loadedOf(db, trips),
    };
    void driverDb().snapshot.get(vehicleId).then((prev) => {
      if (prev && prev.trips.length && prev.planVersion !== next.planVersion) {
        const before = new Set(prev.trips.flatMap((t) => t.trip.orderIds));
        const removed = [...before].filter((id) => !ids.has(id));
        const added = [...ids].filter((id) => !before.has(id));
        if (removed.length || added.length) {
          const c = { removed, added, at: new Date().toISOString() };
          setChange(c);
          try {
            localStorage.setItem(`waypoint-run-change-${vehicleId}`, JSON.stringify(c));
          } catch {}
        }
      }
      return driverDb().snapshot.put(next);
    });
  }, [online, db, vehicleId]);


  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    setSyncing(true);
    try {
      // Photos first, so the POD that lists them finds them on the server.
      const pics = await driverDb().photos.where({ vehicleId, status: "queued" }).sortBy("createdAt");
      for (const p of pics) {
        try {
          await api.uploadPhoto(p.id, "pod", p.orderId, p.blob);
          await driverDb().photos.update(p.id, { status: "uploaded", uploadedAt: new Date().toISOString() });
        } catch (e) {
          if (e instanceof OfflineError) throw e;
          await driverDb().photos.update(p.id, { status: "rejected", rejectedReason: e instanceof Error ? e.message : "Not accepted" });
        }
      }
      const all = await driverDb().outbox.where("vehicleId").equals(vehicleId).sortBy("createdAt");
      const queued = all.filter((r) => r.status === "queued");
      const since = publishedAt.current;
      const unsent = await driverDb().netlog.where({ vehicleId, sent: 0 }).sortBy("at");
      const fix = fixRef.current && Date.now() - Date.parse(fixRef.current.at) < FIX_MAX_AGE_MS ? fixRef.current : undefined;
      const extras: SyncExtras = {
        position: fix,
        connectivity: unsent.map((n) => ({ id: n.id, state: n.state, at: n.at })),
        check: since === undefined ? undefined : {
          syncedIds: all.filter((r) => r.status === "synced" && (r.syncedAt ?? "") >= since).map((r) => r.id).slice(-900),
          queued: queued.length,
          rejected: all.filter((r) => r.status === "rejected").length,
          oldestQueuedAt: queued[0]?.createdAt,
          photosQueued: await driverDb().photos.where({ vehicleId, status: "queued" }).count(),
        },
      };
      const res = await api.syncDriverEvents(vehicleId, queued.map((r) => r.event), extras);
      // A reply that lands after the phone lost signal must not log it as back online.
      if (isOnline()) void link("online");
      const done = new Set([...res.accepted, ...res.duplicates]);
      const refused = new Map(res.rejected.filter((r) => !r.retry).map((r) => [r.id, r.reason]));
      // Marked as synced here but the database doesn't have it: send it again.
      const missing = new Set(res.missing ?? []);
      const at = new Date().toISOString();
      await driverDb().outbox.bulkPut([
        ...queued.filter((r) => done.has(r.id)).map((r) => ({ ...r, status: "synced" as const, syncedAt: at })),
        ...queued.filter((r) => refused.has(r.id)).map((r) => ({ ...r, status: "rejected" as const, syncedAt: at, rejectedReason: refused.get(r.id) })),
        ...all.filter((r) => missing.has(r.id)).map((r) => ({ ...r, status: "queued" as const, syncedAt: undefined })),
      ]);
      if (unsent.length) await driverDb().netlog.bulkPut(unsent.map((n) => ({ ...n, sent: 1 as const })));
      setLastSyncAt(at);
    } catch (e) {
      if (e instanceof OfflineError) void link("offline");
      else console.error(e);
    } finally {
      flushing.current = false;
      setSyncing(false);
    }
  }, [vehicleId, link]);

  const queued = rows.filter((r) => r.status === "queued").length;
  const photosQueued = photos.filter((p) => p.status === "queued").length;
  const rejected = rows.filter((r) => r.status === "rejected").length;

  // Send queued records as soon as we are online; heartbeat every 20 s so dispatch sees we're alive.
  useEffect(() => {
    if (!online || queued + photosQueued === 0) return;
    const t = setTimeout(() => void flush(), 0);
    return () => clearTimeout(t);
  }, [online, queued, photosQueued, flush]);
  useEffect(() => {
    if (!online) return;
    const first = setTimeout(() => void flush(), 0);
    const t = setInterval(() => void flush(), 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [online, flush]);

  const record = useCallback(async (e: DriverEvent) => {
    await enqueue(e);
  }, []);

  const addPhoto = useCallback(
    async (orderId: string, blob: Blob) => {
      const id = newId();
      await driverDb().photos.put({ id, vehicleId, orderId, blob, createdAt: new Date().toISOString(), status: "queued" });
      return id;
    },
    [vehicleId],
  );

  const value = useMemo<DriverCtx>(() => {
    const base = online && db ? null : snapshot;
    const trips = base ? base.trips : db ? vehicleTrips(db, vehicleId) : [];
    const serverStops: Record<string, LocalStop> = base ? { ...base.stops } : db ? { ...db.stops } : {};
    const stops: Record<string, LocalStop> = { ...serverStops };
    for (const r of rows) {
      // The cached run can predate a record that has since synced (signal lost before the refetch),
      // so offline the phone's own synced records apply too; online the server copy already has them.
      if (r.status === "rejected" || (r.status === "synced" && !base)) continue;
      const e = r.event;
      const s: LocalStop = { ...(stops[e.orderId] ?? {}), pending: r.status === "queued" };
      if (e.kind === "arrived") s.arrivedAt = e.at;
      if (e.kind === "delivered") Object.assign(s, { deliveredAt: e.at, pod: e.pod });
      if (e.kind === "problem") s.problem = e.problem;
      stops[e.orderId] = s;
    }
    const loadStatus = base ? base.loadStatus : Object.fromEntries(trips.map((t) => [t.trip.id, db?.loads[t.trip.id]?.status ?? "not_started"]));
    const loaded = base ? base.loaded ?? {} : db ? loadedOf(db, trips) : {};
    const published = base ? base.trips.length > 0 : db?.plans[depotOfVehicle(vehicleId)]?.status === "published";
    return {
      vehicleId, online, syncing, fromCache: !!base, savedAt: snapshot?.savedAt, trips, published, stops, loadStatus, loaded, rows, photos, netlog, queued, photosQueued, rejected,
      lastSyncAt: lastSyncAt ?? (db?.driverSync[vehicleId]?.lastSyncAt),
      record, addPhoto, flush, change,
      location: { sharing, status: geoStatus, fix: geo.fix, setSharing },
      ackChange: () => {
        setChange(null);
        try {
          localStorage.removeItem(`waypoint-run-change-${vehicleId}`);
        } catch {}
      },
    };
  }, [online, db, snapshot, rows, photos, netlog, vehicleId, syncing, queued, photosQueued, rejected, lastSyncAt, record, addPhoto, flush, change, sharing, geo, geoStatus, setSharing]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
