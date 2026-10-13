const CACHE_VERSION = "gossip-bh-v11";
const CORE = ["/", "/index.html", "/app.css", "/mobile.css?v=11", "/app.js?v=11", "/logo-512.png", "/poly-gossip-identity.jpg", "/brand-icons/home.png", "/brand-icons/explore.png", "/brand-icons/poly-gossip.png", "/brand-icons/notifications.png", "/brand-icons/campus.png", "/brand-icons/comments.png", "/brand-icons/profile.png", "/manifest.json", "/favicon-32.png", "/apple-touch-icon.png", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter(key => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/")) return;
  event.respondWith(fetch(event.request).then(response => { const copy=response.clone(); caches.open(CACHE_VERSION).then(cache=>cache.put(event.request,copy)); return response; }).catch(()=>caches.match(event.request).then(hit=>hit||caches.match("/index.html"))));
});
