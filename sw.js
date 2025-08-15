/* Simple offline cache for Tacho-Dziennik */
const CACHE_NAME = "tacho-v202508141210";
const OFFLINE_URLS = [
  "./",
  "./index.html",
  "./app.css",
  "./addon-tacho-bar.duo.v4.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith((async () => {
    try {
      const net = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, net.clone());
      return net;
    } catch (err) {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req, {ignoreSearch: true});
      if (cached) return cached;
      return cache.match("./index.html");
    }
  })());
});
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});