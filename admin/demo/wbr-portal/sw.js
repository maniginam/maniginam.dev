/* Minimal service worker — makes the demo installable + offline-tolerant. */
const CACHE = 'wbr-demo-v1';
const ASSETS = [
  './', './index.html',
  './assets/styles.css', './assets/app.js', './assets/icon.svg',
  './manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // network-first for same-origin app files, cache fallback offline
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request).then((r) => {
        const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r;
      }).catch(() => caches.match(e.request).then((m) => m || caches.match('./index.html')))
    );
  }
  // maps/fonts: let the browser handle (network), cache-fallback
  else {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
  }
});
