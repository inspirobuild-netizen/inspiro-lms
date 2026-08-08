// Deliberately conservative service worker.
//
// This console shows per-counsellor financial and student data behind a bearer
// token, so NOTHING from the API is ever cached — a stale or cross-user cache
// hit here would be a data-integrity/privacy bug, not just a UX wart. Only
// same-origin static build assets are cached, and navigations always go to the
// network first so a deploy is picked up immediately.

const CACHE = 'inspiro-admin-static-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL])).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;      // never touch the API host
  if (url.pathname.startsWith('/api/')) return;         // never cache API responses

  // Navigations: network first, fall back to a small offline page.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Immutable build output — safe to serve cache-first.
  if (url.pathname.startsWith('/_next/static/') || /\.(png|svg|ico|webmanifest|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((hit) =>
        hit ?? fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        }),
      ),
    );
  }
});
