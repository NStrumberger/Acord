/* Offline shell, translation engine and models. All of it is served by this
   site, so cross-origin requests are deliberately left alone here. */

/* Bump this whenever the caching policy changes. `activate` deletes every other
   cache, so a bad policy cannot outlive the fix for it -- which is exactly what
   went wrong with v1: it was cache-first with no revalidation and no version,
   so a returning visitor kept an index.html that pointed at hashed assets from
   an older build, and no deploy could ever reach them. v3 also clears the
   ~113 MB the old opus-mt engine left in transformers.js's own cache. */
const CACHE = 'acord-v3';

/* Built assets carry a content hash in their filename, and the engine
   (bergamot/<version>/) and models (models/<pair>/<release>/) a version in
   their path, so a given URL can never mean anything else. Those are safe to
   serve from cache and never re-check -- which matters for ~15 MB of model.
   Everything else -- the page, the manifest, the icons -- lives at a stable URL
   whose content DOES change on a deploy, and must be re-checked. */
const isImmutable = (url) => /\/(assets|bergamot|models)\//.test(url.pathname);

self.addEventListener('install', (e) => {
  // The very first navigation happens before this worker controls the page, so
  // the shell would otherwise never be cached. Precache it explicitly.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(['./', './index.html']))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

/* Cache Storage is shared by every site on this origin (all of
   nstrumberger.github.io), so only Acord's own data is cleared: older acord-*
   caches, and inside transformers.js's shared cache only the old opus-mt
   model's files -- another site may keep its own models there. */
const OLD_MODEL = '/Xenova/opus-mt-en-ro/';

async function clearOldModel() {
  if (!(await caches.has('transformers-cache'))) return;
  const shared = await caches.open('transformers-cache');
  for (const request of await shared.keys()) {
    if (request.url.includes(OLD_MODEL)) await shared.delete(request);
  }
}

self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const key of await caches.keys()) {
    if (key !== CACHE && key.startsWith('acord-')) await caches.delete(key);
  }
  await clearOldModel().catch(() => undefined);
  await self.clients.claim();
})()));

async function store(request, response) {
  if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isImmutable(url)) {
    e.respondWith((async () => {
      const cached = await caches.match(request);
      return cached ?? store(request, await fetch(request));
    })());
    return;
  }

  // Stale while revalidate: answer from cache so the app still opens instantly
  // and works with no network, but always ask the network in the background so
  // the next open is current. One open behind is the price of not blocking
  // first paint on the network; frozen forever was not.
  e.respondWith((async () => {
    const cached = await caches.match(request);
    const fresh = fetch(request)
      .then((response) => store(request, response))
      .catch(() => undefined);
    if (cached) {
      e.waitUntil(fresh);   // keep the worker alive until the refetch finishes
      return cached;
    }
    const response = await fresh;
    if (response) return response;
    // Offline, never cached: a navigation can still be answered by the shell.
    if (request.mode === 'navigate') {
      const shell = await caches.match('./');
      if (shell) return shell;
    }
    throw new Error(`offline and not cached: ${url.pathname}`);
  })());
});
