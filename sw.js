// Nombre de caché con versión (cámbialo cada vez que actualices la app)
const CACHE_NAME = 'eruditos-v2'; // ← Incrementa este número en cada despliegue

// Archivos a cachear (offline)
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon192.png',
  '/icon512.png'
];

// Instalación: guarda los archivos esenciales
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
  // Forzar activación inmediata (no esperar a que cierren la app)
  self.skipWaiting();
});

// Activación: elimina cachés viejas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Tomar control de todos los clientes inmediatamente
  self.clients.claim();
});

// Estrategia: Network First (intenta red primero, luego caché)
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Si la respuesta es válida, actualiza el caché y devuelve
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Si falla la red, devuelve del caché
        return caches.match(event.request);
      })
  );
});
