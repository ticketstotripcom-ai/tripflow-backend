// Additional Service Worker logic imported by Workbox-generated service-worker.js
// Provides background/periodic prefetch of app data and a message-based fallback.

/* global self, caches, fetch */

const APP_DATA_CACHE = 'app-data-v1';
let APP_DATA_URL = null; // Will be set by client via postMessage

async function prefetchAppData() {
  if (!APP_DATA_URL) return;
  try {
    const res = await fetch(APP_DATA_URL, { cache: 'no-store' });
    if (!res || !res.ok) return;
    const cache = await caches.open(APP_DATA_CACHE);
    await cache.put(APP_DATA_URL, res.clone());
  } catch (err) {
    // swallow errors to avoid failing the SW event
  }
}

self.addEventListener('install', (event) => {
  // no-op: Workbox handles asset precache
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data && data.type === 'SET_APP_DATA_URL' && typeof data.url === 'string') {
    APP_DATA_URL = data.url;
  }
  if (data && data.type === 'TRIGGER_PREFETCH') {
    event.waitUntil(prefetchAppData());
  }
  if (data && data.type === 'SHOW_NOTIFICATION') {
    const title = data.title || 'New Update';
    const options = Object.assign({
      body: data.body || 'You have new notifications',
      icon: '/icons/notification-icon.png',
      badge: '/icons/notification-badge.png',
      tag: data.tag || 'app-update',
    }, data.options || {});
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

// Background Sync fallback
self.addEventListener('sync', (event) => {
  if (event.tag === 'app-data-prefetch') {
    event.waitUntil(prefetchAppData());
  }
});

// Periodic Background Sync (where supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'app-data-prefetch') {
    event.waitUntil(prefetchAppData());
  }
});

// Optional: respond to push with a default notification (for future use)
self.addEventListener('push', (event) => {
  try {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'New Update';
    const options = Object.assign({
      body: data.body || 'You have new notifications',
      icon: '/icons/notification-icon.png',
      badge: '/icons/notification-badge.png',
      tag: data.tag || 'app-update',
    }, data.options || {});
    event.waitUntil(self.registration.showNotification(title, options));
  } catch {}
});
