import '@testing-library/jest-dom';            // auto-extends global expect
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// Minimal Notification mock so App's notifications don't crash jsdom
if (!('Notification' in globalThis)) {
  globalThis.Notification = {
    permission: 'granted',
    requestPermission: () => Promise.resolve('granted')
  };
}

