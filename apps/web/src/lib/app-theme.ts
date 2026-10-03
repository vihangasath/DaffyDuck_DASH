"use client";
import { useEffect, useSyncExternalStore } from "react";

// Light/dark for the phone apps (driver and loader). Each app keeps its own choice on the device:
// a driver who prefers light in the cab doesn't change the dock phone. The dark tokens live in globals.css.

export type ThemeApp = "driver" | "loader";
export type ThemeMode = "dark" | "light" | "system";

/** The driver starts dark (cab glare at dawn); the loader follows the phone, since docks are brightly lit. */
const DEFAULT: Record<ThemeApp, ThemeMode> = { driver: "dark", loader: "system" };
const key = (app: ThemeApp) => `waypoint-${app}-theme`;
const EVENT = "waypoint-theme-change";

function stored(app: ThemeApp): ThemeMode {
  if (typeof window === "undefined") return DEFAULT[app];
  try {
    const v = localStorage.getItem(key(app));
    if (v === "dark" || v === "light" || v === "system") return v;
  } catch {}
  return DEFAULT[app];
}

const systemDark = () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

function setAppTheme(app: ThemeApp, mode: ThemeMode) {
  try {
    localStorage.setItem(key(app), mode);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
    mq.removeEventListener("change", callback);
  };
}

export function useAppTheme(app: ThemeApp) {
  const mode = useSyncExternalStore(subscribe, () => stored(app), () => DEFAULT[app]);
  const isDark = useSyncExternalStore(subscribe, () => (stored(app) === "system" ? systemDark() : stored(app) === "dark"), () => DEFAULT[app] === "dark");
  return {
    mode,
    isDark,
    setMode: (m: ThemeMode) => setAppTheme(app, m),
    toggle: () => setAppTheme(app, isDark ? "light" : "dark"),
  };
}

/**
 * Switches the whole document to the dark tokens while this app is on screen, and tints the phone's
 * status bar to match. `className` lets the driver keep its Leaflet map rules (`.driver-dark`).
 */
export function useApplyAppTheme(isDark: boolean, className: string) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle(className, isDark);
    root.setAttribute("data-theme", isDark ? "dark" : "light");
    const meta = document.querySelector('meta[name="theme-color"]');
    const prev = meta?.getAttribute("content");
    meta?.setAttribute("content", isDark ? "#090e17" : "#102447");
    return () => {
      root.classList.remove(className);
      root.removeAttribute("data-theme");
      if (meta && prev) meta.setAttribute("content", prev);
    };
  }, [isDark, className]);
}
