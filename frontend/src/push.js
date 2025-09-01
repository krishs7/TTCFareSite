// push.js
import { API_BASE } from './apiBase.js';

export function isStandalonePWA() {
  const mq = window.matchMedia('(display-mode: standalone)');
  // iOS Safari sets navigator.standalone
  return mq.matches || window.navigator.standalone === true;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replaceAll('-', '+').replaceAll('_', '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export async function ensurePushSubscription() {
  // Require a service worker; Push support is checked on the registration itself.
  if (!('serviceWorker' in navigator)) throw new Error('Service worker not supported');
  const reg = await navigator.serviceWorker.ready;
  // Ask permission on user gesture only — you’ll call this from a button
  if (Notification.permission === 'default') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Notifications denied');
  }
  const hasPush = !!reg.pushManager && typeof reg.pushManager.subscribe === 'function';
  if (!hasPush) throw new Error('Push not supported here');
  const applicationServerKey = urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY || '');
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });

  const res = await fetch(`${API_BASE}/api/push/subscribe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), userAgent: navigator.userAgent })
  });
  if (!res.ok) throw new Error('Failed to save subscription');
  const { id } = await res.json();
  localStorage.setItem('push_sub_id', id);
  return id;
}

export async function scheduleReminders(deadlineISO) {
  const id = localStorage.getItem('push_sub_id');
  if (!id) return { ok: false, reason: 'no-subscription' };
  const res = await fetch(`${API_BASE}/api/reminders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscriptionId: id, deadlineISO })
  });
  return res.ok ? res.json() : { ok: false, reason: 'server' };
}

