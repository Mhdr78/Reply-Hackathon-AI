import { describe, expect, it } from 'vitest';
import { formatDuration, formatTimestamp } from './format';

describe('formatTimestamp / formatDuration', () => {
  it('formats seconds like a video player', () => {
    expect(formatTimestamp(0)).toBe('0:00');
    expect(formatTimestamp(65.9)).toBe('1:05');
    expect(formatTimestamp(3725)).toBe('1:02:05');
    expect(formatTimestamp(-3)).toBe('0:00');
  });
  it('formats durations in minutes', () => {
    expect(formatDuration(5400)).toBe('1h 30m');
    expect(formatDuration(600)).toBe('10 min');
  });
});
