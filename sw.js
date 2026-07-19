// Service worker — offline-first, per the house pattern.
// CACHE bumps with every release (keep in sync with NOTES.md release log).
const CACHE = 'pointer-0.6.0';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './config/region.json',
  './data/spots.json',
  './data/layers/light-pollution.json',
  './data/layers/light-pollution.png',
  './src/main.js',
  './src/styles.css',
  './src/model/geo.js',
  './src/model/spot.js',
  './src/model/dedup.js',
  './src/model/region.js',
  './src/model/store.js',
  './src/model/light.js',
  './src/model/tonight.js',
  './src/model/weather.js',
  './src/model/synthesis.js',
  './src/ui/dom.js',
  './src/ui/theme.js',
  './src/ui/mapview.js',
  './src/ui/synthesis.js',
  './src/ui/lightlayer.js',
  './src/vendor/leaflet.js',
  './src/vendor/leaflet.css',
  './src/vendor/astronomy.js',
];
// NOTE: _headers/_redirects are Cloudflare config, never precache them.

const PRECACHED = new Set(ASSETS.map((u) => new URL(u, self.registration.scope).href));

// Tile hosts BYPASS the SW entirely — opaque cross-origin tiles piped
// through a SW break on iOS WebKit in production (measured in a sibling app).
const TILE_HOSTS = ['tile.openstreetmap.org', 'server.arcgisonline.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // Per-asset, never atomic addAll: one flaky request must not wipe the
      // whole offline cache.
      Promise.allSettled(ASSETS.map((u) => c.add(u)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const names = await caches.keys();
      const next = await caches.open(CACHE);
      for (const name of names) {
        if (name === CACHE) continue;
        // Carry forward runtime-cached entries (anything not in the new
        // precache) so a version bump never re-downloads data.
        const old = await caches.open(name);
        for (const req of await old.keys()) {
          if (!PRECACHED.has(req.url) && !(await next.match(req))) {
            const res = await old.match(req);
            if (res) await next.put(req, res);
          }
        }
        await caches.delete(name);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (TILE_HOSTS.includes(url.hostname)) return; // browser handles tiles

  if (e.request.mode === 'navigate') {
    // Network-first: deploys reach installed clients when online.
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match('./index.html', { ignoreSearch: true })
      )
    );
    return;
  }

  // Stale-while-revalidate for everything else.
  e.respondWith(
    (async () => {
      const cached = await caches.match(e.request, { ignoreVary: true });
      const refetch = fetch(e.request)
        .then(async (res) => {
          if (res && res.ok) {
            const clone = res.clone(); // clone BEFORE returning — race lesson
            const c = await caches.open(CACHE);
            await c.put(e.request, clone);
          }
          return res;
        })
        .catch(() => null);
      return cached ?? (await refetch) ?? Response.error();
    })()
  );
});
