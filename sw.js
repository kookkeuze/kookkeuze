const CACHE_NAME = 'kookkeuze-static-v20';

// Bestanden die altijd vers opgehaald worden (network-first)
const NETWORK_FIRST = ['/', '/index.html', '/styles.css', '/index.js'];

// Statische assets die zelden veranderen (cache-first)
const CACHE_FIRST_ASSETS = [
  '/Logo/favicon-kookkeuze.png',
  '/Logo/apple-touch-icon-kookkeuze.png',
  '/Logo/icon-kookkeuze-192.png',
  '/Logo/icon-kookkeuze-512.png',
  '/Logo/Kookkeuze-logo.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([...NETWORK_FIRST, ...CACHE_FIRST_ASSETS]))
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

  // API-verzoeken: altijd netwerk, nooit cachen
  if (requestUrl.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response('', { status: 504, statusText: 'Offline' }))
    );
    return;
  }

  // HTML/JS/CSS: network-first zodat updates direct zichtbaar zijn
  if (NETWORK_FIRST.includes(requestUrl.pathname)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) =>
          cached || (event.request.mode === 'navigate' ? caches.match('/index.html') : new Response('', { status: 504 }))
        ))
    );
    return;
  }

  // Overige assets: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => new Response('', { status: 504, statusText: 'Offline' }));
    })
  );
});
