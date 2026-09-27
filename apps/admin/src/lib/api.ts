"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@waypoint/ui/toast";
import { clearSession, readToken } from "./session";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Calls the API as the signed-in HR officer. A 401 ends the session (the shell sends you to sign in). */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = readToken();
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: { ...(init.body !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, "Can’t reach the Waypoint server. Check that the API is running.");
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401) clearSession();
  if (!res.ok) throw new ApiError(res.status, json.error ?? `The server couldn’t do that (${res.status}).`);
  return json;
}

/** GET /api/people/<path>, cached under ["people", path] and refreshed by server events. */
export function usePeople<T>(path: string) {
  return useQuery<T>({ queryKey: ["people", path], queryFn: () => api<T>(`/people${path}`) });
}

/** A write to /api/people: toasts the outcome and refreshes every people query. */
export function usePeopleMutation<V, R = unknown>(fn: (v: V) => Promise<R>, ok?: string | ((r: R, v: V) => string)) {
  const qc = useQueryClient();
  return useMutation<R, ApiError, V>({
    mutationFn: fn,
    onSuccess: (r, v) => {
      if (ok) toast.success(typeof ok === "function" ? ok(r, v) : ok);
      void qc.invalidateQueries({ queryKey: ["people"] });
    },
    onError: (e) => toast.error(e.message),
  });
}

/** Live refresh: any change by anyone (HR or operations) re-fetches what's on screen. */
export function subscribeServer(onChange: () => void): () => void {
  const token = readToken();
  if (!token) return () => undefined;
  const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
  es.addEventListener("change", onChange);
  return () => es.close();
}
