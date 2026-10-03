"use client";
// Network records (vehicles, branches, depots, products) for dispatchers: /api/network on the API.
// Cached under ["records", path]; server events refresh them like the operational snapshot.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/toast";
import { readToken, writeSession } from "./session";

class RecordsError extends Error {}

export async function records<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = readToken();
  let res: Response;
  try {
    res = await fetch(`/api/network${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: { ...(init.body !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new RecordsError("Can’t reach the DASH server. Check your connection and try again.");
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401) writeSession(null);
  if (!res.ok) throw new RecordsError(json.error ?? `The server couldn’t do that (${res.status}).`);
  return json;
}

export function useRecords<T>(path: string) {
  return useQuery<T>({ queryKey: ["records", path], queryFn: () => records<T>(path) });
}

/** A write to /api/network: toasts the outcome and refreshes the records and the planner's view. */
export function useRecordsMutation<V, R = unknown>(fn: (v: V) => Promise<R>, ok?: string | ((r: R, v: V) => string)) {
  const qc = useQueryClient();
  return useMutation<R, RecordsError, V>({
    mutationFn: fn,
    onSuccess: (r, v) => {
      if (ok) toast.success(typeof ok === "function" ? ok(r, v) : ok);
      void qc.invalidateQueries({ queryKey: ["records"] });
      void qc.invalidateQueries({ queryKey: ["db"] });
    },
    onError: (e) => toast.error(e.message),
  });
}
