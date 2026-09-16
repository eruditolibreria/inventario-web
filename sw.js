// Cambiar la versión al publicar una nueva entrega de recursos estáticos.
const CACHE_NAME = 'eruditos-v93';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon192.png',
  '/icon512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => Promise.all(
      cacheNames.filter(cacheName => cacheName !== CACHE_NAME).map(cacheName => caches.delete(cacheName))
    ))
  );
  self.clients.claim();
});

function esRecursoEstatico(request, url) {
  if (url.origin !== self.location.origin) return false;
  if (request.mode === 'navigate') return true;
  return ['script', 'style', 'font', 'image', 'manifest'].includes(request.destination);
}

async function actualizarCache(request) {
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!esRecursoEstatico(request, url)) return;

  // Las páginas se actualizan desde red; los recursos estáticos ya visitados
  // se entregan desde caché para no retrasar la interfaz ni guardar respuestas API.
  if (request.mode === 'navigate') {
    event.respondWith(actualizarCache(request).catch(() => caches.match(request)));
    return;
  }

  event.respondWith(caches.match(request).then(cached => cached || actualizarCache(request)));
});
