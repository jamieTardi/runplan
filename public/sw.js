// Minimal service worker: cache static assets, network-first navigation with
// an offline fallback. Data always comes from the network (no stale plans).
const VERSION = "v1";
const STATIC_CACHE = `runplan-static-${VERSION}`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline — RunPlan</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#0a0d13;color:#e5e7eb}div{text-align:center;padding:24px}h1{font-size:1.4rem}p{color:#9ca3af}</style>
</head><body><div><h1>You're offline</h1><p>RunPlan needs a connection to load your plan.<br>Pull to refresh once you're back online.</p></div></body></html>`;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Hashed build assets and icons: cache-first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/icon.svg") {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Pages: network-first, friendly offline fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(
        () => new Response(OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html" } }),
      ),
    );
  }
});
