// Makes the app open without internet once it has been opened online.
const SHELL = 'shell-v1';
const POSTERS = 'posters-v2';   // v2: drops broken posters saved by v1

const FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/planner.js', 'js/catalog.js', 'js/store.js',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== POSTERS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

// App files: newest from the network, saved copy when offline.
async function appFile(request) {
  const cache = await caches.open(SHELL);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) || Response.error();
  }
}

// Posters never change: saved copy first, network only the first time.
// Images from other sites arrive "opaque" (status hidden), so those are kept too;
// a visible error status is never kept, so a failed load is retried next time.
async function poster(request) {
  const cache = await caches.open(POSTERS);
  const saved = await cache.match(request);
  if (saved) return saved;
  try {
    const fresh = await fetch(request);
    if (fresh.ok || fresh.type === 'opaque') {
      await cache.put(request, fresh.clone());
      await trim(cache);
    }
    return fresh;
  } catch {
    // Offline and never saved: the page shows the first letter instead.
    return Response.error();
  }
}

// Keep only the newest posters; old ones are fetched again if still needed.
const MAX_POSTERS = 60;
async function trim(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_POSTERS)).map((k) => cache.delete(k)));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin === self.location.origin) {
    event.respondWith(appFile(request));
  } else if (request.destination === 'image') {
    event.respondWith(poster(request));
  }
  // Everything else (the search lookups) goes straight to the network.
});
