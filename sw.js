/* ============================================================
   SERVICE WORKER — кэширование статики + офлайн-страница
   ============================================================ */

const CACHE_VERSION = 'v4.0.1';
const CACHE_STATIC  = `eduplatform-static-${CACHE_VERSION}`;
const CACHE_DYNAMIC = `eduplatform-dynamic-${CACHE_VERSION}`;
const MAX_DYNAMIC = 60;

const STATIC_ASSETS = [
  './', './index.html', './offline.html', './teacher.html',
  './groups.html', './lesson.html', './my-lessons.html',
  './profile.html', './stats.html', './manifest.json',
  './css/variables.css', './css/base.css', './css/navbar.css',
  './css/catalog.css', './css/groups.css', './css/lesson.css',
  './css/my-lessons.css', './css/profile.css', './css/teacher.css',
  './css/stats.css', './css/glossary.css', './css/achievements.css',
  './css/pwa.css',
  './js/theme-init.js', './js/common.js', './js/sanitize.js',
  './js/progress.js', './js/auth.js', './js/favorites.js',
  './js/achievements.js', './js/glossary.js', './js/pwa.js',
  './js/rich-editor.js', './js/catalog.js', './js/teacher.js',
  './js/lesson.js', './js/groups.js', './js/my-lessons.js',
  './js/profile.js', './js/stats.js', './js/pdf-export.js',
  './icons/icon-192.svg', './icons/icon-512.svg', './icons/icon-maskable.svg'
];

async function trimCache(name, maxItems) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    await Promise.all(keys.slice(0, keys.length - maxItems).map(k => cache.delete(k)));
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache =>
      Promise.allSettled(STATIC_ASSETS.map(url =>
        fetch(url, { cache: 'no-store' }).then(r => {
          if (!r.ok) throw new Error(url + ' ' + r.status);
          return cache.put(url, r);
        }).catch(e => console.warn('[SW] skip', url, e.message))
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_STATIC && k !== CACHE_DYNAMIC).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.pathname.startsWith('/api/')) return;
  if (req.method !== 'GET') return;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;

  // Cross-origin CDN — stale-while-revalidate
  if (url.origin !== location.origin) {
    if (/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(url.hostname)) {
      event.respondWith(
        caches.open(CACHE_DYNAMIC).then(async cache => {
          const cached = await cache.match(req);
          const fetchPromise = fetch(req).then(resp => {
            if (resp && resp.status === 200) {
              event.waitUntil(
                cache.put(req, resp.clone())
                  .then(() => trimCache(CACHE_DYNAMIC, MAX_DYNAMIC))
                  .catch(()=>{})
              );
            }
            return resp;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      );
    }
    return;
  }

  // HTML — network-first
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req).then(resp => {
        const copy = resp.clone();
        event.waitUntil(
          caches.open(CACHE_DYNAMIC)
            .then(cache => cache.put(req, copy))
            .then(() => trimCache(CACHE_DYNAMIC, MAX_DYNAMIC))
            .catch(()=>{})
        );
        return resp;
      }).catch(() =>
        caches.match(req, { ignoreSearch: true }).then(cached => cached || caches.match('./offline.html'))
      )
    );
    return;
  }

  // Статика — cache-first
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(resp => {
        if (!resp || resp.status !== 200 || resp.type === 'opaque') return resp;
        const copy = resp.clone();
        event.waitUntil(
          caches.open(CACHE_DYNAMIC)
            .then(cache => cache.put(req, copy))
            .then(() => trimCache(CACHE_DYNAMIC, MAX_DYNAMIC))
            .catch(()=>{})
        );
        return resp;
      }).catch(() => caches.match('./offline.html'));
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
        .then(() => self.clients.matchAll().then(cs => cs.forEach(c => c.postMessage('CACHE_CLEARED'))))
    );
  }
});