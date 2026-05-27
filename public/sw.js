const CACHE_NAME = 'draw-io-v1';
const OFFLINE_RESOURCES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/pwa_icon_512.png'
];

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching app shell and offline fallbacks');
      return cache.addAll(OFFLINE_RESOURCES);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip caching completely for Socket.IO, API routes, or non-GET requests
  if (
    request.method !== 'GET' ||
    url.pathname.includes('/socket.io') ||
    url.pathname.startsWith('/api') ||
    url.hostname !== self.location.hostname
  ) {
    return; // Let browser process it as usual
  }

  // Stale-While-Revalidate strategy for internal web assets (JS, CSS, HTML, images)
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        }).catch((err) => {
          console.warn('[Service Worker] Fetch failed, serving cached asset if possible:', err);
          return cachedResponse;
        });

        // Return cached response immediately if we have it, otherwise wait for network
        return cachedResponse || fetchPromise;
      });
    })
  );
});
