// src/push-client.js
import { API_BASE } from './apiBase.js';

// Detect installed PWA (iOS requires install for Web Push)
export function isStandalonePWA() {
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator?.standalone === true
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replaceAll('-', '+').replaceAll('_', '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function getPublicKey() {
  // Your backend already exposes this
  const r = await fetch(`${API_BASE}/api/push/public-key`);
  if (!r.ok) throw new Error('Could not fetch VAPID key');
  const j = await r.json();
  return j.publicKey || j.key || '';
}

// Robust wait for a controlling/active SW: listens for controllerchange and checks registration.active
async function waitForServiceWorkerReady({ timeoutMs = 20000 } = {}) {
  if (!('serviceWorker' in navigator)) throw new Error('Service worker not supported');

  // Fast path: already controlling
  if (navigator.serviceWorker.controller) {
    try { return await navigator.serviceWorker.ready; } catch (_) { /* fall through */ }
  }

  // Race controllerchange, .ready, and a timeout
  const readyP = navigator.serviceWorker.ready.catch(() => null);

  const controllerP = new Promise((resolve) => {
    const onChange = () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
      resolve(true);
    };
    navigator.serviceWorker.addEventListener('controllerchange', onChange, { once: true });
  });

  const timeoutP = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Service worker still starting up')), timeoutMs)
  );

  try {
    await Promise.race([readyP, controllerP, timeoutP]);
  } catch (e) {
    // One last check: if there's an active registration, proceed with it
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg?.active) return reg;
    throw e;
  }

  // Prefer .ready when it eventually resolves; fallback to the current registration
  try { return await navigator.serviceWorker.ready; }
  catch {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) return reg;
    throw new Error('Service worker registration missing');
  }
}


// Robust wait for a controlling/active SW on iOS first-run
async function ensureActiveServiceWorker({ timeoutMs = 30000, allowOneReload = true } = {}) {
  if (!('serviceWorker' in navigator)) throw new Error('Service worker not supported');

  // If there is no registration yet, defensively register now (same scope as Vite PWA)
  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg) {
    reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  }

  // Fast path: already controlled
  if (navigator.serviceWorker.controller && reg?.active) {
    return reg;
  }

  // Watch installing/waiting worker state → 'activated'
  const sw = reg.installing || reg.waiting;
  const stateP = sw
    ? new Promise((resolve) => {
        const onState = () => {
          if (sw.state === 'activated') {
            sw.removeEventListener('statechange', onState);
            resolve(true);
          }
        };
        sw.addEventListener('statechange', onState);
        onState();
      })
    : Promise.resolve(false);

  // Also watch for controllerchange (page becomes controlled)
  const controlP = new Promise((resolve) => {
    const onCtrl = () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onCtrl);
      resolve(true);
    };
    navigator.serviceWorker.addEventListener('controllerchange', onCtrl, { once: true });
  });

  // Race: .ready, activation state, controllerchange, and a timeout
  const timeoutP = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), timeoutMs)
  );

  try {
    await Promise.race([navigator.serviceWorker.ready, stateP, controlP, timeoutP]);
  } catch (e) {
    // iOS can need a one-time reload for first control; do it only once per session
    if (
      allowOneReload &&
      !navigator.serviceWorker.controller &&
      (window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone)
    ) {
      if (!sessionStorage.getItem('sw_reloaded_once')) {
        sessionStorage.setItem('sw_reloaded_once', '1');
        location.reload();
        await new Promise(() => {}); // stop further work post-reload
      }
    }
    throw new Error('Service worker still starting up');
  }

  // Prefer the resolved ready registration; fall back to current registration
  try { return await navigator.serviceWorker.ready; }
  catch { return (await navigator.serviceWorker.getRegistration()) || reg; }
}


/**
 * Request permission, ensure a subscription, and persist it to your backend.
 * Must be called from a user gesture (click/tap) for iOS.
 * Works on desktop browsers too (if supported).
 */
export async function ensurePushSubscription() {
  // 1) Basic capability checks (Push API requires SW + PushManager + Notifications)
  if (!('serviceWorker' in navigator)) throw new Error('Service worker not supported');
  if (!('Notification' in window)) throw new Error('Notifications not supported');
  // iOS: only installed web apps can push
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Mac') && 'ontouchend' in window);
  if (isIOS && !isStandalonePWA()) {
    throw new Error('On iPhone/iPad, install the app first (Share → Add to Home Screen).');
  }

  // 2) Permission (must be inside a user gesture)
  if (Notification.permission === 'default') {
    const res = await Notification.requestPermission(); // must be user-gesture driven on iOS
    if (res !== 'granted') throw new Error('Notifications denied');
  }
  if (Notification.permission !== 'granted') throw new Error('Notifications denied');

  const ready = await ensureActiveServiceWorker({ timeoutMs: 30000, allowOneReload: true });

  if (!ready?.pushManager) throw new Error('Push Manager not available');

  // 4) Get live VAPID key from backend to avoid drift
  const publicKey = await getPublicKey();
  if (!publicKey) throw new Error('Missing VAPID public key');

  // 5) Reuse existing subscription if present, otherwise subscribe
  const existing = await ready.pushManager.getSubscription();
  let sub = existing;
  if (!sub) {
    sub = await ready.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  // 6) Persist to backend; store id for later schedules
  const res = await fetch(`${API_BASE}/api/push/subscribe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), userAgent: navigator.userAgent }),
  });
  if (!res.ok) throw new Error('Failed to save subscription');
  const { id } = await res.json();
  localStorage.setItem('push_sub_id', id);
  return id;
}

/** Call this when you start a session to queue T-5 / T-1 jobs on the server */
export async function scheduleReminders(deadlineISO) {
  const subscriptionId = localStorage.getItem('push_sub_id');
  if (!subscriptionId) throw new Error('Background reminders are not enabled yet');
  const r = await fetch(`${API_BASE}/api/reminders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscriptionId, deadlineISO }),
  });
  if (!r.ok) throw new Error('Failed to schedule reminders');
  return r.json();
}

