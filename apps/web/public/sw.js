// Waypoint service worker: keeps the app shell available with no signal.
// Navigations: network first, but a slow network loses to the cached page after NAV_TIMEOUT_MS
// (the fresh copy still lands in the cache for next time). Static assets: cache first.
const CACHE = "waypoint-shell-v4";
const NAV_TIMEOUT_MS = 4000;
const SHELL = ["/", "/driver", "/driver/outbox", "/loader", "/loader/flags", "/loader/more", "/store", "/icon.svg"];
// With no network, a page never visited falls back to its own app's home, never another role's.
const homeOf = (path) => (path.startsWith("/loader") ? "/loader" : path.startsWith("/driver") ? "/driver" : "/");

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// Screens opened inside the app (client-side navigation) never pass through "navigate" below, so the
// app asks for each one to be kept: a load list or a stop then reopens with no network.
// It also sends the scripts and styles the page loaded: the first page (sign-in) loads before this worker
// is in control, so without them the app's own code would be missing offline.
self.addEventListener("message", (event) => {
  const { type, url, assets } = event.data ?? {};
  if (type !== "cache-page" || typeof url !== "string" || !url.startsWith("/")) return;
  const statics = (Array.isArray(assets) ? assets : []).filter((a) => typeof a === "string" && a.startsWith("/_next/static/"));
  event.waitUntil(
    caches.open(CACHE).then(async (c) => {
      const missing = [];
      for (const a of statics) if (!(await c.match(a))) missing.push(a);
      await Promise.all([c.add(url), ...missing.map((a) => c.add(a))]);
    }).catch(() => undefined),
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
    const cached = () => caches.match(req).then((hit) => hit || caches.match(homeOf(url.pathname)) || caches.match("/"));
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
