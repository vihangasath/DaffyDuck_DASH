"use client";
// The web app's only way to the server: every WaypointApi call becomes a request to apps/api
// (proxied as same-origin /api/* by next.config.ts). The signed-in user comes from the bearer token.
import type { Db, Snapshot, WaypointApi } from "@waypoint/core/contract";
import { hydrate } from "@waypoint/core/reference";
import { onSessionChange, readToken, writeSession } from "@/lib/session";
import { isOnline, OfflineError } from "./network";

// A phone on one bar of signal can hold a request open for minutes. Past this, give up and treat it
// as no signal: the driver outbox keeps the record and the next flush retries it (same event id).
const TIMEOUT_MS = 20_000;
/** A photo is ~200 KB: on a weak signal give it longer before calling it a dead zone. */
const UPLOAD_TIMEOUT_MS = 60_000;

async function request<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<T> {
  if (!isOnline()) throw new OfflineError();
  const token = readToken();
  const ctl = new AbortController();
  const raw = body instanceof Blob;
  const timer = setTimeout(() => ctl.abort(), raw ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS);
  let res: Response;
  let json: T & { error?: string };
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(raw ? { "content-type": body.type || "image/jpeg" } : body !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: raw ? body : body === undefined ? undefined : JSON.stringify(body),
      signal: ctl.signal,
    });
    // The proxy answers 5xx while the API is down: treat it like a dead zone, the driver outbox retries.
    if (res.status === 502 || res.status === 503 || res.status === 504) throw new OfflineError();
    // The body can stall too on a weak signal, so it stays under the same timer.
    json = (await res.json().catch((e: unknown) => {
      if (ctl.signal.aborted) throw e;
      return {};
    })) as T & { error?: string };
  } catch {
    throw new OfflineError();
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401) {
    writeSession(null);
    throw new Error(json.error ?? "Your session has ended. Please sign in again.");
  }
  if (!res.ok) throw new Error(json.error ?? `The server couldn’t do that (${res.status}).`);
  return json;
}

const op = <T>(name: string, args: unknown) => request<T>("POST", `/ops/${name}`, args);

let lastReference: Snapshot["reference"] | null = null;
/** Master data from the latest snapshot, so an offline app can keep it with its cached state. */
export const latestReference = () => lastReference;

export const httpApi: WaypointApi = {
  async snapshot(): Promise<Db> {
    const s = await request<Snapshot>("GET", "/ops/snapshot");
    // Master data (branches, vehicles, products…) comes from the database: re-hydrate before any screen reads it.
    hydrate(s.reference);
    lastReference = s.reference;
    return s.db;
  },
  placeOrder: ({ outletId, temp, lines }) => op("placeOrder", { outletId, temp, lines }),
  closeOrdersAndPlan: (depot) => op("closeOrdersAndPlan", { depot }),
  replan: (depot) => op("replan", { depot }),
  moveOrder: (depot, orderId, target) => op("moveOrder", { depot, orderId, target }),
  publishPlan: (depot) => op("publishPlan", { depot }),
  setVehicleStatus: (vehicleId, status) => op("setVehicleStatus", { vehicleId, status }),
  setLoadLine: (tripId, key, loaded) => op("setLoadLine", { tripId, key, loaded }),
  flagShortfall: (input) => op("flagShortfall", input),
  releaseTrip: (tripId) => op("releaseTrip", { tripId }),
  resolveShortfall: (id, resolution) => op("resolveShortfall", { id, resolution }),
  syncDriverEvents: (vehicleId, events, extras) => op("syncDriverEvents", { vehicleId, events, ...extras }),
  checkCode: (orderId, code) => op("checkCode", { orderId, code }),
  uploadPhoto: (id, kind, orderId, image) => request("PUT", `/photos/${encodeURIComponent(id)}?kind=${kind}&orderId=${encodeURIComponent(orderId)}`, image),
  ackNotice: (id, response) => op("ackNotice", { id, response }),
  confirmReceipt: (receipt) => op("confirmReceipt", receipt),
  resolveException: (id) => op("resolveException", { id }),
};

/** A stored photo as a blob (images need the bearer token, so they can't be a plain <img src>). */
export async function fetchPhoto(id: string): Promise<Blob> {
  if (!isOnline()) throw new OfflineError();
  const token = readToken();
  let res: Response;
  try {
    res = await fetch(`/api/photos/${encodeURIComponent(id)}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new OfflineError();
  }
  if (!res.ok) throw new Error(res.status === 404 ? "Not uploaded yet" : `Photo unavailable (${res.status})`);
  return res.blob();
}

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
