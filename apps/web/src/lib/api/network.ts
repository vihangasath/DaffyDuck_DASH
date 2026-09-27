"use client";
// Connectivity: the real browser state plus a per-tab "simulated dead zone" switch for demos,
// so a judge can reproduce the Kandy-corridor scenario without touching devtools.

const KEY = "waypoint-sim-offline";
const EVT = "waypoint-network";

export class OfflineError extends Error {
  constructor() {
    super("No connection");
    this.name = "OfflineError";
  }
}

export function simulatedOffline(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setSimulatedOffline(on: boolean) {
  try {
    if (on) sessionStorage.setItem(KEY, "1");
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode: ignore */
  }
  window.dispatchEvent(new Event(EVT));
}

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine && !simulatedOffline();
}

export function onNetworkChange(fn: () => void): () => void {
  window.addEventListener("online", fn);
  window.addEventListener("offline", fn);
  window.addEventListener(EVT, fn);
  return () => {
    window.removeEventListener("online", fn);
    window.removeEventListener("offline", fn);
    window.removeEventListener(EVT, fn);
  };
}
