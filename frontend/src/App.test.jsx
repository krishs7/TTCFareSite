// frontend/src/App.test.jsx
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App.jsx';

function successResponse({ deadlineISO, minutesAhead = 5 } = {}) {
  const deadline = deadlineISO ?? new Date(Date.now() + minutesAhead * 60 * 1000).toISOString();
  return {
    ok: true,
    json: async () => ({
      eligibleNow: true,
      deadlineISO: deadline,
      windowSeconds: 7200,
      reasons: [],
      savingsText:
        'Your TTC leg is free when transferring with GO on the same card within the window.',
      expiredNextSteps: null
    })
  };
}

beforeEach(() => {
  // Use REAL timers. Mock fetch only.
  const mockFetch = vi.fn((url) => {
    if (String(url).includes('/api/check')) return Promise.resolve(successResponse());
    return Promise.resolve({ ok: false, text: async () => 'not found' });
  });
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('App', () => {
  test('renders header', () => {
    render(<App />);
    expect(screen.getByText(/One-Fare Helper/i)).toBeInTheDocument();
  });

  test('starts a timer and shows status', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /I just tapped/i }));

    await waitFor(() => {
      expect(screen.getByText(/Eligible/i)).toBeInTheDocument();
    }, { timeout: 3000 });

    expect(screen.getByText(/TTC leg is free/i)).toBeInTheDocument();
    expect(screen.getByText(/^⏱️/)).toBeInTheDocument();
  });

  test('shows HH:MM:SS when >= 1h remain', async () => {
    // Pin time WITHOUT fake timers
    const fixedNow = Date.parse('2025-08-29T16:00:00Z');
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

    // Next call returns a deadline exactly 2h ahead of fixedNow
    fetch.mockImplementationOnce(() =>
      Promise.resolve(successResponse({
        deadlineISO: new Date(fixedNow + 2 * 3600 * 1000).toISOString()
      }))
    );

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /I just tapped/i }));

    await waitFor(() => {
      expect(screen.getByText(/⏱️\s*2:00:00/)).toBeInTheDocument();
    }, { timeout: 3000 });

    nowSpy.mockRestore();
  });

  test('handles API error gracefully', async () => {
    // Fail the NEXT call to /api/check only
    fetch.mockImplementationOnce(() =>
      Promise.resolve({ ok: false, status: 500, text: async () => 'server error' })
    );

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /I just tapped/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/API error/i);
    }, { timeout: 3000 });

    errSpy.mockRestore();
  });
});

