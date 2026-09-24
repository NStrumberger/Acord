/* Offline shell. The translation model is cached by transformers.js itself in
   the Cache API, so cross-origin requests are deliberately left alone here. */
const CACHE = 'gendered-translator-v1';

// The very first navigation happens before this worker controls the page, so
// the shell would otherwise never be cached. Precache it explicitly.
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(['./', './index.html']))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
      return response;
    } catch (error) {
      // Offline and not cached: fall back to the shell for navigations.
      if (request.mode === 'navigate') {
        const shell = await caches.match('./');
        if (shell) return shell;
      }
      throw error;
    }
  })());
});
