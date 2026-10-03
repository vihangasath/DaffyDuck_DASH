"use client";
import { useEffect, useState } from "react";
import type { LoginResult, SessionUser } from "@waypoint/core/contract";
import type { Role } from "@waypoint/core/domain/types";

export type Session = SessionUser;

export const HOME: Record<Role, string> = { admin: "/", dispatcher: "/dispatcher", loader: "/loader", driver: "/driver", store: "/store" };

// Per-tab session (sessionStorage), so a judge can run several roles side by side in different tabs.
// The API issues the token; it is sent as `Authorization: Bearer …` on every request.
const KEY = "waypoint-session";
const EVT = "waypoint-session";

interface Stored {
  token: string;
  user: SessionUser;
}

function read(): Stored | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Stored) : null;
    return s?.token ? s : null;
  } catch {
    return null;
  }
}
function write(s: Stored | null) {
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode: the session lasts until reload */
  }
  window.dispatchEvent(new Event(EVT));
}

export const readSession = (): Session | null => read()?.user ?? null;
export const readToken = (): string | null => read()?.token ?? null;
export const onSessionChange = (fn: () => void) => {
  window.addEventListener(EVT, fn);
  return () => window.removeEventListener(EVT, fn);
};

/** Updates the signed-in user's view (e.g. the outlet a regional store manager is looking at), or signs out with `null`. */
export function writeSession(user: Session | null) {
  const cur = read();
  write(user && cur ? { ...cur, user } : null);
}

type SignInResult = { ok: true; user: Session } | { ok: false; error: string; adminUrl?: string };

export async function signIn(username: string, password: string): Promise<SignInResult> {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password, app: "web" }),
    });
    const json = (await res.json().catch(() => ({}))) as Partial<LoginResult> & { error?: string; adminUrl?: string };
    if (!res.ok || !json.token || !json.user) return { ok: false, error: json.error ?? "Sign-in failed. Please try again.", adminUrl: json.adminUrl };
    write({ token: json.token, user: json.user });
    return { ok: true, user: json.user };
  } catch {
    return { ok: false, error: "Can’t reach the DASH server. Check your connection and try again." };
  }
}

export async function signOut() {
  const token = readToken();
  write(null);
  if (token) await fetch("/api/auth/logout", { method: "POST", headers: { authorization: `Bearer ${token}` } }).catch(() => undefined);
}

/**
 * Re-reads the user from the API (dispatch may have reassigned the vehicle, or HR disabled the account).
 * Keeps the outlet a regional store manager chose to look at.
 */
export async function refreshSession(): Promise<void> {
  const cur = read();
  if (!cur) return;
  try {
    const res = await fetch("/api/auth/me", { headers: { authorization: `Bearer ${cur.token}` } });
    if (res.status === 401) return write(null);
    if (!res.ok) return;
    const user = (await res.json()) as SessionUser;
    write({ token: cur.token, user });
  } catch {
    /* offline: keep the cached session so the driver app still opens */
  }
}

export function useSession(): [Session | null, boolean] {
  const [s, set] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => {
      set(readSession());
      setReady(true);
    };
    sync();
    return onSessionChange(sync);
  }, []);
  return [s, ready];
}
