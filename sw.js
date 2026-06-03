// Twin City Cannabis service worker — Phase 20
// ─────────────────────────────────────────────────────────────────────
// Two purposes:
//   1. Offline shell — cache the homepage + core assets so the site loads
//      even without a network. Critical for civic-utility positioning.
//   2. Notification routing — handle clicks on Phase 18 drop alerts so
//      the watchlist opens correctly even when the tab was closed.
//
// Does NOT yet wire real Web Push (would need a VAPID push service +
// server endpoints to manage subscriptions). The handlers below are
// scaffolded so adding that later is a small change, not a rewrite.

// Bump CACHE_NAME on shell changes so the SW evicts the old cache on activate.
// v3: evict the broken-app.js cache from the brief window when a top-level
// ReferenceError was bricking the SPA boot.
// v4: ship the "Verified Owner" badge — new index.html shell (badge element)
// + app.js (?v=ownerbadge). Bump forces clients off the stale cached shell.
const CACHE_NAME = 'tcc-shell-v4';
const SHELL_URLS = [
  '/',
  '/index.html',
  '/css/styles.css',
  // SPA runtime — without these, the cached HTML loads but the page is blank
  // because the data + app code can't fetch from a dead network. Cached
  // versions get evicted whenever the ?v= cache-buster in index.html changes.
  '/js/data.js',
  '/js/app.js',
  '/img/twin-city-cannabis-logo-32.png',
  '/img/twin-city-cannabis-logo-128.png',
  '/img/twin-city-cannabis-logo-192.png',
  '/img/twin-city-cannabis-logo-512.png',
  '/img/twin-city-cannabis-brand-mark-512.png',
  '/og-image.png',
];

// Install: precache the shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Use addAll but don't fail the whole SW if one asset 404s
      Promise.all(
        SHELL_URLS.map((url) =>
          cache.add(url).catch(() => null)
        )
      )
    )
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for HTML (always-fresh data when online), cache
// fallback when offline. Cache-first for everything else (CSS, images).
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // Skip cross-origin requests entirely — let them go straight to network
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML: network-first
  const isHTML = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Update cache in the background
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Other assets: cache-first, fall back to network
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Cache successful same-origin GETs opportunistically
        if (res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      });
    })
  );
});

// Notification click: focus an existing tab if one is open, otherwise
// open a fresh window. Always route to the watchlist filter.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/#watchlist';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((all) => {
      // Try to focus an existing TCC tab
      for (const client of all) {
        if ('focus' in client) {
          client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      // No tab open → open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(target);
      }
    })
  );
});

// Push: receives encrypted payload from the Cloudflare Worker (push.js)
// and displays a system notification even when no TCC tab is open.
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) {}
  const title = payload.title || 'Twin City Cannabis';
  const body = payload.body || 'A product you’re watching has moved.';
  const url = payload.url || '/#watchlist';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/img/twin-city-cannabis-logo-192.png',
      badge: '/img/twin-city-cannabis-logo-192.png',
      tag: payload.tag || 'tcc-watchlist-drop',
      data: { url },
      renotify: true,
    })
  );
});
