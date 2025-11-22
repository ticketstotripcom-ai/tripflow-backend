// Service Worker for TTT CRM - Enhanced for offline functionality
const CACHE_NAME = 'ttt-crm-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/src/main.tsx',
  '/favicon.ico',
  '/manifest.json'
];

// Error handling wrapper
function handleError(context, error) {
  console.error(`[ServiceWorker] Error in ${context}:`, error);
  // Send error to all clients for monitoring
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'SERVICE_WORKER_ERROR',
        context,
        error: error.message || error.toString(),
        timestamp: Date.now()
      });
    });
  });
}

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
      .catch(error => {
        handleError('install', error);
        // Continue installation even if caching fails
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
    .catch(error => {
      handleError('activate', error);
      // Continue activation even if cache cleanup fails
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip requests with no-cache headers
  if (event.request.headers.get('cache-control') === 'no-cache') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then((response) => {
          // Check if we received a valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            })
            .catch(error => {
              handleError('fetch-cache', error);
              // Continue even if caching fails
            });

          return response;
        });
      })
      .catch((error) => {
        handleError('fetch-network', error);
        // Network request failed, try to serve from cache
        return caches.match(event.request).then((response) => {
          if (response) {
            return response;
          }
          
          // If not in cache, return offline page or fallback
          if (event.request.destination === 'document') {
            return caches.match('/').then((response) => {
              return response || new Response('Offline - Please check your connection');
            });
          }
          
          return new Response('Offline - Resource not available', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain'
            })
          });
        });
      })
  );
});

// Background sync for offline operations
self.addEventListener('sync', async (event) => {
  console.log('Background sync event:', event.tag);
  
  try {
    if (event.tag === 'sync-notifications') {
      event.waitUntil(syncNotifications());
    } else if (event.tag === 'sync-offline-data') {
      event.waitUntil(syncOfflineData());
    }
  } catch (error) {
    handleError('sync', error);
  }
});

// Sync notifications
async function syncNotifications() {
  try {
    const clients = await self.clients.matchAll();
    for (const client of clients) {
      client.postMessage({ type: 'SYNC_NOTIFICATIONS' });
    }
  } catch (error) {
    console.error('Failed to sync notifications:', error);
  }
}

// Sync offline data
async function syncOfflineData() {
  try {
    const clients = await self.clients.matchAll();
    for (const client of clients) {
      client.postMessage({ type: 'SYNC_OFFLINE_DATA' });
    }
  } catch (error) {
    console.error('Failed to sync offline data:', error);
  }
}

// Handle messages from the app
self.addEventListener('message', (event) => {
  try {
    if (event.data && event.data.type) {
      switch (event.data.type) {
        case 'SKIP_WAITING':
          self.skipWaiting();
          break;
        case 'GET_VERSION':
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ version: CACHE_NAME });
          }
          break;
        case 'CACHE_URLS':
          if (event.data.urls && Array.isArray(event.data.urls)) {
            event.waitUntil(cacheUrls(event.data.urls));
          }
          break;
      }
    }
  } catch (error) {
    handleError('message', error);
  }
});

// Cache additional URLs
async function cacheUrls(urls) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const cachePromises = urls.map(url => {
      return fetch(url)
        .then(response => {
          if (response.ok) {
            return cache.put(url, response);
          }
        })
        .catch(error => {
          console.error(`Failed to cache ${url}:`, error);
        });
    });
    
    return Promise.all(cachePromises);
  } catch (error) {
    handleError('cacheUrls', error);
    return Promise.resolve();
  }
}

// Handle push notifications
self.addEventListener('push', (event) => {
  try {
    const options = {
      body: 'You have new updates in TTT CRM',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: 1
      }
    };

    event.waitUntil(
      self.registration.showNotification('TTT CRM Update', options)
    );
  } catch (error) {
    handleError('push-notification', error);
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  try {
    event.notification.close();
    
    event.waitUntil(
      clients.openWindow('/')
    );
  } catch (error) {
    handleError('notification-click', error);
  }
});

// Global error handler for uncaught errors
self.addEventListener('error', (event) => {
  handleError('global-error', event.error || event.message);
});

// Handle unhandled promise rejections
self.addEventListener('unhandledrejection', (event) => {
  handleError('unhandled-rejection', event.reason);
});