/* Órbita · cache para abrir rápido e funcionar com internet ruim.
 * Página principal: rede primeiro (pega versões novas), cache se estiver offline.
 * Arquivos fixos: cache primeiro. Chamadas ao servidor nunca passam pelo cache. */
const CACHE = "orbita-v3";
const SHELL = ["./", "index.html", "claude-shim.js", "config.js", "vendor/supabase.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  const isPage = e.request.mode === "navigate" || /\.(html|js|webmanifest)$/.test(u.pathname) || u.pathname.endsWith("/");
  if (isPage) {
    e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match("index.html"))));
  } else {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((n) => { const cp = n.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return n; })));
  }
});
