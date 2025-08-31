// src/PushFlow.test.jsx
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Tool from './pages/Tool.jsx';

beforeEach(() => {
  // Ensure alert exists (JSDOM doesn't implement it)
  vi.stubGlobal('alert', vi.fn());

  // Minimal presence check for Push API
  vi.stubGlobal('PushManager', function () {});

  // Fake service worker registration with pushManager.subscribe
  const fakeReg = {
    pushManager: {
      subscribe: vi.fn(async () => ({
        toJSON: () => ({ endpoint: 'x', keys: { p256dh: 'p', auth: 'a' } })
      })),
    },
  };
  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve(fakeReg) },
  });

  // Notifications allowed
  vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn(async () => 'granted') });

  // Mock fetch for our API calls
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const u = String(url);
    if (u.includes('/api/push/subscribe')) {
      return { ok: true, json: async () => ({ id: 'sub-1' }) };
    }
    if (u.includes('/api/reminders')) {
      return { ok: true, json: async () => ({ ok: true }) };
    }
    if (u.includes('/api/check')) {
      return {
        ok: true,
        json: async () => ({
          eligibleNow: true,
          deadlineISO: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          windowSeconds: 7200,
          reasons: [],
          savingsText: '',
          expiredNextSteps: null,
        }),
      };
    }
    return { ok: false, text: async () => 'not found' };
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Push flow', () => {
  test('enables and schedules', async () => {
    render(<Tool />);

    // Enable background reminders (creates subscription + stores id)
    fireEvent.click(screen.getByRole('button', { name: /Enable background reminders/i }));
    await waitFor(() => expect(localStorage.getItem('push_sub_id')).toBe('sub-1'));

    // Start a session; should schedule reminders without throwing
    fireEvent.click(screen.getByRole('button', { name: /I just tapped/i }));
    await waitFor(() => expect(screen.getByText(/Eligible/i)).toBeInTheDocument());
  });
});

