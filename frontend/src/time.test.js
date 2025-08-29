import { describe, test, expect } from 'vitest';
import { formatHMS } from './time.js';

describe('formatHMS', () => {
  test('>= 1h formats as H:MM:SS', () => {
    expect(formatHMS(2 * 3600 * 1000)).toBe('2:00:00');
    expect(formatHMS( (1 * 3600 + 5 * 60 + 7) * 1000 )).toBe('1:05:07');
  });
  test('< 1h formats as MM:SS', () => {
    expect(formatHMS(59 * 60 * 1000)).toBe('59:00');
    expect(formatHMS( (5 * 60 + 9) * 1000 )).toBe('05:09');
  });
});

