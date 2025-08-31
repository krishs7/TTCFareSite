import '@testing-library/jest-dom';            // auto-extends global expect
import { vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});


// ✅ JSDOM doesn't have alert; stub it for tests
if (!('alert' in globalThis)) {
  vi.stubGlobal('alert', vi.fn());
}

// ✅ Simulate presence of the Push API
if (!('PushManager' in globalThis)) {
  // existence check only; we don't need a full class, just presence
  vi.stubGlobal('PushManager', function () {});
}

// ✅ Provide a ready service worker with a fake PushManager
const fakeReg = {
  pushManager: {
    subscribe: vi.fn(async () => ({
      toJSON: () => ({ endpoint: 'x', keys: { p256dh: 'p', auth: 'a' } }),
    })),
  },
};

Object.defineProperty(globalThis.navigator, 'serviceWorker', {
  configurable: true,
  value: { ready: Promise.resolve(fakeReg) },
});



/* Minimal Notification mock so App's notifications don't crash jsdom
if (!('Notification' in globalThis)) {
  globalThis.Notification = {
    permission: 'granted',
    requestPermission: () => Promise.resolve('granted')
  };
}
*/
// (Optional) keep your Notification mock if not already present
if (!('Notification' in globalThis)) {
  vi.stubGlobal('Notification', {
    permission: 'granted',
    requestPermission: vi.fn(async () => 'granted'),
  });
}

// (Optional) If any test triggers PWA registration, avoid real module work
vi.mock('virtual:pwa-register', () => ({ registerSW: () => ({}) }));

