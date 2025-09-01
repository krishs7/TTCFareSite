// sw.js (Service Worker)
const APP_VERSION = '2025-09-01-01';
// Workbox precache
import { precacheAndRoute } from 'workbox-precaching';
self.__WB_DISABLE_DEV_LOGS = true;
precacheAndRoute(self.__WB_MANIFEST || []);

// Ensure the new worker activates immediately and takes control of pages
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());            // activate this SW right away
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());          // control all open clients in scope
});

// Handle incoming push (from our backend)
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}
  const title = data.title || 'One-Fare';
  const body  = data.body  || 'Reminder';
  const url   = data.url   || '/tool';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      data: { url },
      requireInteraction: false
    })
  );
});

// Focus or open the tool when the user taps the notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/tool';
  event.waitUntil(
    (async () => {
      const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = all.find(c => 'url' in c && c.url.includes(target));
      if (existing) { existing.focus(); return; }
      await clients.openWindow(target);
    })()
  );
});

