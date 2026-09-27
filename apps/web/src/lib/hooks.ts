"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { api, type Db } from "@/lib/api";
import { isOnline, OfflineError, onNetworkChange } from "@/lib/api/network";
import { contextFor, DEMO_DATE } from "@waypoint/core/reference";
import type { Depot } from "@waypoint/core/domain/types";
import { toast } from "@/components/toast";

/** Operational state from the API (live via server events). Keeps the last good copy while offline. */
export function useDb() {
  return useQuery<Db>({
    queryKey: ["db"],
    queryFn: () => api.snapshot(),
    staleTime: Infinity,
    // Safety net if a proxy blocks the event stream.
    refetchInterval: 60_000,
    retry: false,
    networkMode: "always",
    placeholderData: (prev) => prev,
  });
}

export function useOnline() {
  return useSyncExternalStore(onNetworkChange, isOnline, () => true);
}

/** Runs an API call, refreshes data, and turns failures into a readable toast. */
export function useAct() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> => {
      setBusy(true);
      try {
        const r = await fn();
        if (ok) toast.success(ok);
        return r;
      } catch (e) {
        toast.error(e instanceof OfflineError ? "No connection — try again when you’re back in coverage." : e instanceof Error ? e.message : "Something went wrong");
        return undefined;
      } finally {
        setBusy(false);
        qc.invalidateQueries({ queryKey: ["db"] });
      }
    },
    [qc],
  );
  return { run, busy };
}

/** Planner context (network + orders + availability) derived from the current server state. */
export function useDepotView(depot: Depot) {
  const { data: db } = useDb();
  return useMemo(() => {
    if (!db) return null;
    const orders = db.orders.filter((o) => o.depot === depot && o.forDate === DEMO_DATE);
    const ctx = contextFor(db.orders, db.fleetStatus);
    return { db, orders, ctx, plan: db.plans[depot], day: db.day[depot] };
  }, [db, depot]);
}

/** Current time, refreshed every `ms` (for "x min ago" labels). */
export function useNow(ms = 30_000) {
  const [now, set] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => set(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
