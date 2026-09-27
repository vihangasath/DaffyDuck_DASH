"use client";
import { useSyncExternalStore } from "react";
import type { LoginResult, SessionUser } from "@waypoint/core/contract";

// Waypoint People keeps its session in localStorage (shared by the HR officer's tabs).
// It is a different origin from the operations app, so the two sign-ins never collide.
const KEY = "waypoint-admin-session";
const EVT = "waypoint-admin-session";

interface Stored {
  token: string;
  user: SessionUser;
}

let cache: { raw: string | null; value: Stored | null } = { raw: null, value: null };
function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw !== cache.raw) cache = { raw, value: raw ? (JSON.parse(raw) as Stored) : null };
    return cache.value;
  } catch {
    return null;
  }
}
function write(s: Stored | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the session lasts until reload */
  }
  window.dispatchEvent(new Event(EVT));
}

export const readToken = () => read()?.token ?? null;
export const clearSession = () => write(null);

function subscribe(fn: () => void) {
  window.addEventListener(EVT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVT, fn);
    window.removeEventListener("storage", fn);
  };
}

/** [user, ready]: `ready` is false during server rendering and the first client pass. */
export function useAdmin(): [SessionUser | null, boolean] {
  const s = useSyncExternalStore(subscribe, read, () => undefined);
  return s === undefined ? [null, false] : [s?.user ?? null, true];
}

export async function signIn(username: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password, app: "admin" }) });
    const json = (await res.json().catch(() => ({}))) as Partial<LoginResult> & { error?: string };
    if (!res.ok || !json.token || !json.user) return { ok: false, error: json.error ?? "Sign-in failed. Please try again." };
    write({ token: json.token, user: json.user });
    return { ok: true };
  } catch {
    return { ok: false, error: "Can’t reach the Waypoint server. Is the API running?" };
  }
}

export async function signOut() {
  const token = readToken();
  write(null);
  if (token) await fetch("/api/auth/logout", { method: "POST", headers: { authorization: `Bearer ${token}` } }).catch(() => undefined);
}
