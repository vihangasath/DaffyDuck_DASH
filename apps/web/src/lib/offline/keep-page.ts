"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Asks the service worker to keep the current screen, so it reopens with no network (see public/sw.js). */
export function useKeepPageOffline() {
  const path = usePathname();
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Wait for the screen's own code to finish loading, then hand over the list with the page.
    const t = setTimeout(() => {
      const assets = [...new Set(performance.getEntriesByType("resource").map((e) => new URL(e.name).pathname).filter((p) => p.startsWith("/_next/static/")))];
      void navigator.serviceWorker.ready.then((reg) => (navigator.serviceWorker.controller ?? reg.active)?.postMessage({ type: "cache-page", url: path, assets }));
    }, 1000);
    return () => clearTimeout(t);
  }, [path]);
}
