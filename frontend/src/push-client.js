// src/push-client.js
import { API_BASE } from './apiBase.js';

// --- PWA helpers ---
export function isStandalonePWA() {
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator?.standalone === true
  );
}

// --- Base64url helpers (robust for Safari/iOS quirks) ---
function normalizeBase64url(b64) {
  let s = String(b64 || '').trim();

  // Strip accidental quotes
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);

  // Strip PEM armor if someone pasted a PEM
  if (s.includes('BEGIN PUBLIC KEY')) {
    s = s.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  }

  // If it looks like JSON, try to parse { publicKey: "..." } or { key: "..." }
  if ((s.startsWith('{') && s.endsWith('}')) || s.includes(':')) {
    try {
      const j = JSON.parse(s);
      s = j.publicKey || j.key || '';
    } catch { /* ignore */ }
  }

  // Convert to URL-safe base64
  s = s.replace(/\s+/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  // Pad to multiple of 4
  const pad = (4 - (s.length % 4)) % 4;
  if (pad) s += '='.repeat(pad);

  return s;
}

function urlBase64ToUint8ArraySafe(base64String) {
  const s = normalizeBase64url(base64String);
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  let raw = '';
  try {
    raw = atob(b64);
  } catch {
    throw new Error('Invalid VAPID public key: base64 decode failed');
  }
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  // Must be uncompressed P-256 point: 65 bytes starting with 0x04
  if (out.length !== 65 || out[0] !== 0x04) {
    throw new Error(`Invalid VAPID public key: expected 65 bytes starting with 0x04, got ${out.length}`);
  }
  return out;
}

// --- Read once, decide JSON vs text after ---
// Avoids "body is disturbed or locked" on Safari by never reading twice.
async function fetchVapidPublicKey() {
  const r = await fetch(`${API_BASE}/api/push/public-key`, {
    headers: { 'accept': 'application/json' },
    cache: 'no-store',
  });
  if (!r.ok) throw new Error('Could not fetch VAPID public key from server');

  // Read ONCE
  const raw = await r.text();
  let key = '';
  // Prefer JSON if parseable; otherwise use plain text
  try {
    const j = JSON.parse(raw);
    key = j.publicKey || j.key || '';
  } catch {
    key = raw;
  }
  key = (key || '').trim();
  if (!key) throw new Error('Server returned empty VAPID key');
  return key;
}

// --- iOS-first-run SW readiness ---
async function ensureActiveServiceWorker({ timeoutMs = 30000, allowOneReload = true } = {}) {
  if (!('serviceWorker' in navigator)) throw new Error('Service worker not supported');

  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg) {
    reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  }

  if (navigator.serviceWorker.controller && reg?.active) return reg;

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

  const controlP = new Promise((resolve) => {
    const onCtrl = () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onCtrl);
      resolve(true);
    };
    navigator.serviceWorker.addEventListener('controllerchange', onCtrl, { once: true });
  });

  const timeoutP = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs));

  try {
    await Promise.race([navigator.serviceWorker.ready, stateP, controlP, timeoutP]);
  } catch (e) {
    if (
      allowOneReload &&
      !navigator.serviceWorker.controller &&
      (window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone)
    ) {
      if (!sessionStorage.getItem('sw_reloaded_once')) {
        sessionStorage.setItem('sw_reloaded_once', '1');
        location.reload();
        await new Promise(() => {}); // halt until reload
      }
    }
    throw new Error('Service worker still starting up');
  }

  try { return await navigator.serviceWorker.ready; }
  catch { return (await navigator.serviceWorker.getRegistration()) || reg; }
}

// --- Public API used by your UI ---
export async function ensurePushSubscription() {
  // Capability + iOS PWA checks
  if (!('serviceWorker' in navigator)) throw new Error('Service worker not supported');
  if (!('Notification' in window)) throw new Error('Notifications not supported');
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Mac') && 'ontouchend' in window);
  if (isIOS && !isStandalonePWA()) {
    throw new Error('On iPhone/iPad, install the app first (Share → Add to Home Screen).');
  }

  // Permission (must be from user gesture)
  if (Notification.permission === 'default') {
    const res = await Notification.requestPermission();
    if (res !== 'granted') throw new Error('Notifications denied');
  }
  if (Notification.permission !== 'granted') throw new Error('Notifications denied');

  // Ensure SW is active/controlling (iOS first-run)
  const reg = await ensureActiveServiceWorker({ timeoutMs: 30000, allowOneReload: true });
  if (!reg?.pushManager) throw new Error('Push Manager not available');

  // Fetch, sanitize, validate, and decode the VAPID key → Uint8Array(65)
  const rawKey = await fetchVapidPublicKey();
  const applicationServerKey = urlBase64ToUint8ArraySafe(rawKey);

  // Reuse existing subscription if present, else subscribe
    let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    } catch (err) {
      // If a stale subscription with a different appServerKey exists, some UAs throw InvalidStateError.
      if (err && err.name === 'InvalidStateError') {
        const stale = await reg.pushManager.getSubscription();
        if (stale) await stale.unsubscribe();
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      } else {
        throw err;
      }
    }
  }

  // Persist to backend
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

