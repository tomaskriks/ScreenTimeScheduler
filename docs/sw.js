// Makes the app open without internet once it has been opened online.
const SHELL = 'shell-v1';
const POSTERS = 'posters-v1';

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
async function poster(request) {
  const cache = await caches.open(POSTERS);
  const saved = await cache.match(request);
  if (saved) return saved;
  const fresh = await fetch(request);
  cache.put(request, fresh.clone());
  return fresh;
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
