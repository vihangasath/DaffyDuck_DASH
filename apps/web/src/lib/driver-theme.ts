"use client";
import { useSyncExternalStore } from "react";

export type DriverThemeMode = "dark" | "light" | "system";

const STORAGE_KEY = "waypoint-driver-theme";
const EVENT_NAME = "waypoint-driver-theme-change";

function getStoredTheme(): DriverThemeMode {
  if (typeof window === "undefined") return "dark";
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === "dark" || val === "light" || val === "system") return val;
  } catch {}
  return "dark";
}

function getSystemDark(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function setDriverTheme(mode: DriverThemeMode) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {}
  window.dispatchEvent(new Event(EVENT_NAME));
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT_NAME, callback);
  window.addEventListener("storage", callback);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", callback);
  return () => {
    window.removeEventListener(EVENT_NAME, callback);
    window.removeEventListener("storage", callback);
    mq.removeEventListener("change", callback);
  };
}

function getIsDark(): boolean {
  const mode = getStoredTheme();
  return mode === "system" ? getSystemDark() : mode === "dark";
}

export function useDriverTheme(): {
  mode: DriverThemeMode;
  isDark: boolean;
  setMode: (mode: DriverThemeMode) => void;
  toggle: () => void;
} {
  const mode = useSyncExternalStore(subscribe, getStoredTheme, () => "dark" as DriverThemeMode);
  const isDark = useSyncExternalStore(subscribe, getIsDark, () => true);

  const toggle = () => {
    setDriverTheme(isDark ? "light" : "dark");
  };

  return {
    mode,
    isDark,
    setMode: setDriverTheme,
    toggle,
  };
}
