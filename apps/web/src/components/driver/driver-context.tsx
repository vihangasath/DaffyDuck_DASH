"use client";
import { liveQuery } from "dexie";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type DriverEvent, type StopRecord } from "@/lib/api";
import { OfflineError } from "@/lib/api/network";
import { useDb, useOnline } from "@/lib/hooks";
import { driverDb, enqueue, type OutboxRow, type RunSnapshot } from "@/lib/offline/outbox";
import { depotOfVehicle, vehicleTrips } from "@waypoint/core/views";
import type { TripEval } from "@waypoint/core/planner/evaluate";
import type { Db } from "@/lib/api";

const loadedOf = (db: Db, trips: TripEval[]) =>
  Object.fromEntries(trips.flatMap((t) => Object.entries(db.loads[t.trip.id]?.lines ?? {}).map(([k, l]) => [k, l.loaded] as const)));

export interface LocalStop extends Partial<StopRecord> {
  pending?: boolean;
}

export interface RunChange {
  removed: string[];
  added: string[];
  at: string;
}

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
  queued: number;
  /** Records the server refused; the driver needs to see them (and call dispatch). */
  rejected: number;
  lastSyncAt?: string;
  record: (e: DriverEvent) => Promise<void>;
  flush: () => Promise<void>;
  change: RunChange | null;
  ackChange: () => void;
}

const Ctx = createContext<DriverCtx | null>(null);
export const useDriver = () => useContext(Ctx)!;

export function DriverProvider({ vehicleId, children }: { vehicleId: string; children: ReactNode }) {
  const online = useOnline();
  const { data: db } = useDb();
  const [rows, setRows] = useState<OutboxRow[]>([]);
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
    return () => {
      a.unsubscribe();
      b.unsubscribe();
    };
  }, [vehicleId]);

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
      const queued = await driverDb().outbox.where({ vehicleId, status: "queued" }).sortBy("createdAt");
      const res = await api.syncDriverEvents(vehicleId, queued.map((r) => r.event));
      const done = new Set([...res.accepted, ...res.duplicates]);
      const refused = new Map(res.rejected.filter((r) => !r.retry).map((r) => [r.id, r.reason]));
      const at = new Date().toISOString();
      await driverDb().outbox.bulkPut([
        ...queued.filter((r) => done.has(r.id)).map((r) => ({ ...r, status: "synced" as const, syncedAt: at })),
        ...queued.filter((r) => refused.has(r.id)).map((r) => ({ ...r, status: "rejected" as const, syncedAt: at, rejectedReason: refused.get(r.id) })),
      ]);
      setLastSyncAt(at);
    } catch (e) {
      if (!(e instanceof OfflineError)) console.error(e);
    } finally {
      flushing.current = false;
      setSyncing(false);
    }
  }, [vehicleId]);

  const queued = rows.filter((r) => r.status === "queued").length;
  const rejected = rows.filter((r) => r.status === "rejected").length;

  // Send queued records as soon as we are online; heartbeat every 20 s so dispatch sees we're alive.
  useEffect(() => {
    if (!online || queued === 0) return;
    const t = setTimeout(() => void flush(), 0);
    return () => clearTimeout(t);
  }, [online, queued, flush]);
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

  const value = useMemo<DriverCtx>(() => {
    const base = online && db ? null : snapshot;
    const trips = base ? base.trips : db ? vehicleTrips(db, vehicleId) : [];
    const serverStops: Record<string, LocalStop> = base ? { ...base.stops } : db ? { ...db.stops } : {};
    const stops: Record<string, LocalStop> = { ...serverStops };
    for (const r of rows) {
      if (r.status !== "queued") continue;
      const e = r.event;
      const s: LocalStop = { ...(stops[e.orderId] ?? {}), pending: true };
      if (e.kind === "arrived") s.arrivedAt = e.at;
      if (e.kind === "delivered") Object.assign(s, { deliveredAt: e.at, pod: e.pod });
      if (e.kind === "problem") s.problem = e.problem;
      stops[e.orderId] = s;
    }
    const loadStatus = base ? base.loadStatus : Object.fromEntries(trips.map((t) => [t.trip.id, db?.loads[t.trip.id]?.status ?? "not_started"]));
    const loaded = base ? base.loaded ?? {} : db ? loadedOf(db, trips) : {};
    const published = base ? base.trips.length > 0 : db?.plans[depotOfVehicle(vehicleId)]?.status === "published";
    return {
      vehicleId, online, syncing, fromCache: !!base, savedAt: snapshot?.savedAt, trips, published, stops, loadStatus, loaded, rows, queued, rejected,
      lastSyncAt: lastSyncAt ?? (db?.driverSync[vehicleId]?.lastSyncAt),
      record, flush, change,
      ackChange: () => {
        setChange(null);
        try {
          localStorage.removeItem(`waypoint-run-change-${vehicleId}`);
        } catch {}
      },
    };
  }, [online, db, snapshot, rows, vehicleId, syncing, queued, rejected, lastSyncAt, record, flush, change]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
