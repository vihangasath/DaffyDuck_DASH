"use client";
// The web app's only way to the server: every WaypointApi call becomes a request to apps/api
// (proxied as same-origin /api/* by next.config.ts). The signed-in user comes from the bearer token.
import type { Db, Snapshot, WaypointApi } from "@waypoint/core/contract";
import { hydrate } from "@waypoint/core/reference";
import { onSessionChange, readToken, writeSession } from "@/lib/session";
import { isOnline, OfflineError } from "./network";

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  if (!isOnline()) throw new OfflineError();
  const token = readToken();
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new OfflineError();
  }
  // The proxy answers 5xx while the API is down: treat it like a dead zone, the driver outbox retries.
  if (res.status === 502 || res.status === 503 || res.status === 504) throw new OfflineError();
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401) {
    writeSession(null);
    throw new Error(json.error ?? "Your session has ended. Please sign in again.");
  }
  if (!res.ok) throw new Error(json.error ?? `The server couldn’t do that (${res.status}).`);
  return json;
}

const op = <T>(name: string, args: unknown) => request<T>("POST", `/ops/${name}`, args);

export const httpApi: WaypointApi = {
  async snapshot(): Promise<Db> {
    const s = await request<Snapshot>("GET", "/ops/snapshot");
    // Master data (branches, vehicles, products…) comes from the database: re-hydrate before any screen reads it.
    hydrate(s.reference);
    return s.db;
  },
  placeOrder: ({ outletId, temp, lines }) => op("placeOrder", { outletId, temp, lines }),
  closeOrdersAndPlan: (depot) => op("closeOrdersAndPlan", { depot }),
  replan: (depot) => op("replan", { depot }),
  moveOrder: (depot, orderId, target) => {
    const t = "defer" in target ? { defer: true as const, code: target.code, note: target.note } : target;
    return op("moveOrder", { depot, orderId, target: t });
  },
  publishPlan: (depot) => op("publishPlan", { depot }),
  setVehicleStatus: (vehicleId, status) => op("setVehicleStatus", { vehicleId, status }),
  setLoadLine: (tripId, key, loaded) => op("setLoadLine", { tripId, key, loaded }),
  flagShortfall: ({ tripId, orderId, skuId, loaded, kind, decision, photo }) => op("flagShortfall", { tripId, orderId, skuId, loaded, kind, decision, photo }),
  releaseTrip: (tripId) => op("releaseTrip", { tripId }),
  resolveShortfall: (id, resolution) => op("resolveShortfall", { id, resolution }),
  syncDriverEvents: (vehicleId, events) => op("syncDriverEvents", { vehicleId, events }),
  ackNotice: (id, response) => op("ackNotice", { id, response }),
  confirmReceipt: ({ orderId, lines, issues }) => op("confirmReceipt", { orderId, lines, issues }),
  resolveException: (id) => op("resolveException", { id }),
};

/**
 * Live updates: the API pushes "change" whenever any user changes anything; the caller refetches.
 * Re-connects when this tab signs in or out. EventSource can't send headers, so the token rides in the URL.
 */
export function subscribeServer(fn: () => void): () => void {
  let es: EventSource | null = null;
  let current: string | null = null;
  const open = () => {
    const token = readToken();
    if (token === current) return;
    es?.close();
    current = token;
    es = token ? new EventSource(`/api/events?token=${encodeURIComponent(token)}`) : null;
    es?.addEventListener("change", fn);
    // After the stream drops (API restart, lost signal) it reconnects by itself; refetch to catch up.
    es?.addEventListener("hello", fn);
  };
  open();
  const off = onSessionChange(open);
  return () => {
    off();
    es?.close();
  };
}
