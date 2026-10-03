"use client";
import { useQueryClient } from "@tanstack/react-query";
import { liveQuery } from "dexie";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, latestReference, type Db } from "@/lib/api";
import { OfflineError } from "@/lib/api/network";
import { useDb, useOnline } from "@/lib/hooks";
import { newId } from "@/lib/offline/outbox";
import { loaderDb, type DockSnapshot, type TickRow } from "@/lib/offline/loader-store";
import { hydrate } from "@waypoint/core/reference";

interface LoaderCtx {
  /** Server state with this phone's unsent ticks applied; the cached copy when there is no connection. */
  db: Db | undefined;
  /** Signal and the API both reachable: needed for flagging and release, not for ticking. */
  connected: boolean;
  fromCache: boolean;
  savedAt?: string;
  syncing: boolean;
  queued: number;
  rejected: TickRow[];
  tick: (tripId: string, key: string, loaded: number) => Promise<void>;
  flush: () => Promise<void>;
  /** Sends every queued tick; true when none are left. Flagging and release go after the ticks they depend on. */
  drain: () => Promise<boolean>;
  dismissRejected: (tripId: string) => Promise<void>;
}

const Ctx = createContext<LoaderCtx | null>(null);
export const useLoader = () => useContext(Ctx)!;

/** Applies ticks to the load lists they belong to (copy-on-write: the query cache is never mutated). */
function overlay(db: Db, ticks: TickRow[]): Db {
  if (!ticks.length) return db;
  const loads = { ...db.loads };
  for (const t of ticks) {
    const l = loads[t.tripId];
    const line = l?.lines[t.key];
    if (!l || !line || l.status === "released" || l.status === "held") continue;
    loads[t.tripId] = {
      ...l,
      status: l.status === "not_started" && t.loaded > 0 ? "loading" : l.status,
      lines: { ...l.lines, [t.key]: { ...line, loaded: Math.max(0, Math.min(t.loaded, line.planned)) } },
    };
  }
  return { ...db, loads };
}

export function LoaderProvider({ depot, children }: { depot: string; children: ReactNode }) {
  const online = useOnline();
  const qc = useQueryClient();
  const { data: serverDb, dataUpdatedAt, isError } = useDb();
  const [rows, setRows] = useState<TickRow[]>([]);
  const [cached, setCached] = useState<DockSnapshot | null>(null);
  const [syncing, setSyncing] = useState(false);
  // When a send last failed for lack of connection; cleared by the next successful snapshot.
  const [unreachableAt, setUnreachableAt] = useState(0);
  const flushing = useRef(false);

  useEffect(() => {
    const a = liveQuery(() => loaderDb().ticks.orderBy("createdAt").toArray()).subscribe({ next: setRows });
    void loaderDb().snapshot.get(depot).then((s) => {
      if (!s) return;
      // Opening with no connection: master data (outlet names, vehicles) comes from the cached copy too.
      if (s.reference && !latestReference()) hydrate(s.reference);
      setCached(s);
    });
    return () => a.unsubscribe();
  }, [depot]);

  // Keep the copy on the phone fresh while connected (read back only after a reload with no connection).
  useEffect(() => {
    if (!serverDb || isError) return;
    void loaderDb().snapshot.put({ depot, savedAt: new Date(dataUpdatedAt || Date.now()).toISOString(), db: serverDb, reference: latestReference() });
  }, [serverDb, dataUpdatedAt, isError, depot]);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    setSyncing(true);
    let sent = 0;
    try {
      const queued = await loaderDb().ticks.where("status").equals("queued").sortBy("createdAt");
      for (const r of queued) {
        try {
          await api.setLoadLine(r.tripId, r.key, r.loaded);
          await loaderDb().ticks.update(r.id, { status: "synced", syncedAt: new Date().toISOString() });
          sent++;
        } catch (e) {
          if (e instanceof OfflineError) {
            setUnreachableAt(Date.now());
            break; // keep the rest queued, in order
          }
          await loaderDb().ticks.update(r.id, { status: "rejected", syncedAt: new Date().toISOString(), rejectedReason: e instanceof Error ? e.message : "Not accepted" });
        }
      }
      // Synced ticks only matter until the next snapshot includes them.
      const old = new Date(Date.now() - 12 * 3600_000).toISOString();
      await loaderDb().ticks.where("status").equals("synced").and((r) => (r.syncedAt ?? "") < old).delete();
    } finally {
      flushing.current = false;
      setSyncing(false);
      if (sent) void qc.invalidateQueries({ queryKey: ["db"] });
    }
  }, [qc]);

  const queued = rows.filter((r) => r.status === "queued").length;

  // Send as soon as there is something queued and a signal; retry every 15 s while it fails.
  useEffect(() => {
    if (!online || !queued) return;
    const first = setTimeout(() => void flush(), 0);
    const again = setInterval(() => void flush(), 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(again);
    };
  }, [online, queued, flush]);

  const tick = useCallback(async (tripId: string, key: string, loaded: number) => {
    await loaderDb().ticks.put({ id: newId(), tripId, key, loaded, createdAt: new Date().toISOString(), status: "queued" });
  }, []);

  const drain = useCallback(async () => {
    // A flush already running holds the lock: wait for it, then send whatever is left.
    for (let i = 0; i < 50 && flushing.current; i++) await new Promise((r) => setTimeout(r, 100));
    await flush();
    return (await loaderDb().ticks.where("status").equals("queued").count()) === 0;
  }, [flush]);

  const dismissRejected = useCallback(async (tripId: string) => {
    await loaderDb().ticks.where("tripId").equals(tripId).and((r) => r.status === "rejected").delete();
  }, []);

  const value = useMemo<LoaderCtx>(() => {
    const connected = online && !isError && !(unreachableAt > dataUpdatedAt);
    // The in-memory copy from the server is the freshest; the phone's copy covers a reload with no connection.
    const base = serverDb ?? cached?.db;
    const baseTime = serverDb ? new Date(dataUpdatedAt).toISOString() : cached?.savedAt ?? "";
    // Unsent ticks, plus sent ones the base copy doesn't include yet (no flicker back while it refetches).
    const pending = rows.filter((r) => r.status === "queued" || (r.status === "synced" && (r.syncedAt ?? "") > baseTime));
    return {
      db: base ? overlay(base, pending) : undefined,
      connected,
      fromCache: !connected && !!base,
      savedAt: baseTime || undefined,
      syncing,
      queued,
      rejected: rows.filter((r) => r.status === "rejected"),
      tick,
      flush,
      drain,
      dismissRejected,
    };
  }, [online, unreachableAt, isError, serverDb, cached, dataUpdatedAt, rows, syncing, queued, tick, flush, drain, dismissRejected]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
