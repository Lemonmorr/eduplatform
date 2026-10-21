/* ============================================================
   SERVICE WORKER — кэширование статики + офлайн-страница
   ============================================================ */

const CACHE_VERSION = 'v3.0.0'; // Новая версия
const CACHE_STATIC = `eduplatform-static-${CACHE_VERSION}`;
const CACHE_DYNAMIC = `eduplatform-dynamic-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  './',
  './index.html',
  './offline.html',
  './manifest.json',
  './css/variables.css',
  './css/base.css',
  './css/navbar.css',
  './css/catalog.css',
  './css/groups.css',
  './css/lesson.css',
  './css/my-lessons.css',
  './css/profile.css',
  './css/teacher.css',
  './css/stats.css',
  './css/glossary.css',
  './css/achievements.css',
  './js/theme-init.js',
  './js/common.js',
  './js/sanitize.js',
  './js/progress.js',
  './js/auth.js',
  './js/favorites.js',
  './js/achievements.js',
  './js/glossary.js',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './icons/icon-maskable.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Не все ассеты закэшированы:', err);
      }))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_STATIC && k !== CACHE_DYNAMIC)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // API запросы не кэшируем
  if (url.pathname.startsWith('/api/')) {
    return; 
  }

  if (req.method !== 'GET') return;

  if (url.origin !== location.origin) {
    if (
      url.hostname.includes('cdn.jsdelivr.net') ||
      url.hostname.includes('cdnjs.cloudflare.com') ||
      url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')
    ) {
      event.respondWith(
        caches.open(CACHE_DYNAMIC).then(cache =>
          cache.match(req).then(cached => {
            const fetchPromise = fetch(req).then(resp => {
              if (resp && resp.status === 200) cache.put(req, resp.clone());
              return resp;
            }).catch(() => cached);
            return cached || fetchPromise;
          })
        )
      );
    }
    return;
  }

  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE_DYNAMIC).then(cache => cache.put(req, copy)).catch(() => {});
          return resp;
        })
        .catch(() =>
          caches.match(req, { ignoreSearch: true }).then(cached => cached || caches.match('./offline.html'))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req)
        .then(resp => {
          if (!resp || resp.status !== 200 || resp.type === 'opaque') return resp;
          const copy = resp.clone();
          caches.open(CACHE_DYNAMIC).then(cache => cache.put(req, copy)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match('./offline.html'));
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});