import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Tool from './pages/Tool.jsx';

function successResponse({ deadlineISO, minutesAhead = 5 } = {}) {
  const deadline = deadlineISO ?? new Date(Date.now() + minutesAhead * 60 * 1000).toISOString();
  return {
    ok: true,
    json: async () => ({
      eligibleNow: true,
      deadlineISO: deadline,
      windowSeconds: 7200,
      reasons: [],
      savingsText: 'Your TTC leg is free when transferring with GO on the same card within the window.',
      expiredNextSteps: null
    })
  };
}

beforeEach(() => {
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

describe('Tool', () => {
  test('renders header', () => {
    render(<Tool />);
    expect(screen.getByText(/One-Fare Helper/i)).toBeInTheDocument();
  });

  test('starts a timer and shows status', async () => {
    render(<Tool />);
    fireEvent.click(screen.getByRole('button', { name: /I just tapped/i }));
    await waitFor(() => {
      expect(screen.getByText(/Eligible/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/^⏱️/)).toBeInTheDocument();
  });

  test('handles API error gracefully', async () => {
    fetch.mockImplementationOnce(() =>
      Promise.resolve({ ok: false, status: 500, text: async () => 'server error' })
    );
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<Tool />);
    fireEvent.click(screen.getByRole('button', { name: /I just tapped/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/API error/i);
    });

    errSpy.mockRestore();
  });
});

