const CACHE_NAME = 'kookkeuze-static-v11';
const ASSETS = [
  '/',
  '/index.html',
  '/recept-zoeken',
  '/recept-zoeken.html',
  '/recept-zoeken.css',
  '/recept-zoeken.js',
  '/styles.css',
  '/index.js',
  '/Logo/favicon-kookkeuze.png',
  '/Logo/apple-touch-icon-kookkeuze.png',
  '/Logo/icon-kookkeuze-192.png',
  '/Logo/icon-kookkeuze-512.png',
  '/Logo/Kookkeuze-logo.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);

  if (requestUrl.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response('', { status: 504, statusText: 'Offline' }))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => {
        if (event.request.mode === 'navigate') {
          if (requestUrl.pathname === '/recept-zoeken' || requestUrl.pathname === '/recept-zoeken.html') {
            return caches.match('/recept-zoeken.html');
          }
          return caches.match('/index.html');
        }
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
