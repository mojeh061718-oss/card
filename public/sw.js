/**
 * Service worker: precache the app shell so a home-screen launch works with
 * no network at all. Card art is generated at runtime from seeds, so there
 * are no image assets to cache — the whole game is code plus a save file.
 */

const CACHE = 'cardboard-v3';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(['./', './index.html', './manifest.webmanifest']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Navigations: network first so updates land, cache as the offline floor.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r ?? Response.error())),
    );
    return;
  }

  // Hashed build assets: cache first, they never change under the same name.
  event.respondWith(
    caches.match(request).then(hit => hit ?? fetch(request).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(request, copy));
      }
      return res;
    })),
  );
});
