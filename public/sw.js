const CACHE_NAME = 'upsc-hub-v1';
const ASSETS = ['/', '/styles.css', '/app.jsx', '/map-component.jsx'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
