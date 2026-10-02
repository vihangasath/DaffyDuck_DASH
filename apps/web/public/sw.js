// Waypoint service worker: keeps the app shell available with no signal.
// Navigations: network first, but a slow network loses to the cached page after NAV_TIMEOUT_MS
// (the fresh copy still lands in the cache for next time). Static assets: cache first.
const CACHE = "waypoint-shell-v2";
const NAV_TIMEOUT_MS = 4000;
const SHELL = ["/", "/driver", "/driver/outbox", "/loader", "/store", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  const url = new URL(req.url);

  if (req.mode === "navigate") {
    const network = fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    });
    const cached = () => caches.match(req).then((hit) => hit || caches.match("/driver") || caches.match("/"));
    // Only this exact page may stand in for a slow network; the /driver fallback is for no network at all.
    const slow = new Promise((resolve) => setTimeout(resolve, NAV_TIMEOUT_MS)).then(() => caches.match(req));
    event.respondWith(
      Promise.race([network, slow.then((hit) => hit || network)]).catch(() => cached()),
    );
    event.waitUntil(network.catch(() => undefined));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.endsWith(".svg") || url.pathname.endsWith(".woff2")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
  }
});
