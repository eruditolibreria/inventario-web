// Nombre de caché con versión (cámbialo cada vez que actualices la app)
const CACHE_NAME = 'eruditos-v22';

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
  // No tomar control de paginas ya abiertas (evita recargas inesperadas)
  // self.clients.claim();
});

// Estrategia: Network First (intenta red primero, luego caché)
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Solo cachear si la petición es GET y la respuesta es válida
        if (response && response.status === 200 && event.request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Si falla la red, devuelve del caché (pero solo para GET)
        if (event.request.method === 'GET') {
          return caches.match(event.request);
        }
        // Para otros métodos (POST, etc.) simplemente propagamos el error
        throw new Error('Network error');
      })
  );
});
