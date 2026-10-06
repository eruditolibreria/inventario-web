const CACHE = 'club-eruditos-v31';
const SHELL = [
  '/club/index.html', '/club/styles.css', '/club/app.js', '/club/navigation.js', '/club/session.js', '/club/idle.js', '/club/content.js', '/js/back-exit.js', '/js/config.js', '/js/vendor/supabase-umd.js',
  '/club/splash-eruditos.png', '/club/launchericon-192x192.png', '/club/manifest.json',
];

const STATIC = new Set([...SHELL, '/club/camino-erudito.webp', '/club/logo-blanco.webp', '/club/launchericon-512x512.png']);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('club-eruditos-') && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Una lista explicita evita capturar /api/ al adaptar este worker al dominio independiente.
  if (!STATIC.has(url.pathname) && !(request.mode === 'navigate' && url.pathname === '/club/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put('/club/index.html', copy)));
      }
      return response;
    }).catch(() => caches.match('/club/index.html')));
    return;
  }

  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
    }
    return response;
  })));
});
