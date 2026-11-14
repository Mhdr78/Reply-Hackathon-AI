import { describe, expect, it } from 'vitest';
import { parseWhisperX } from './whisperx';

describe('parseWhisperX', () => {
  it('sorts segments, trims text, assigns ids and fills missing word timings', () => {
    const t = parseWhisperX(
      {
        segments: [
          { start: 5, end: 9, text: ' Second ', words: [] },
          { start: 0.5, end: 4.8, text: 'Today we', speaker: 'SPEAKER_00', words: [{ word: 'Today', start: 0.5, end: 0.9 }, { word: '42' }] },
        ],
      },
      'ml-01',
    );
    expect(t.language).toBe('en');
    expect(t.segments.map((s) => [s.id, s.text])).toEqual([[0, 'Today we'], [1, 'Second']]);
    expect(t.segments[0].words[1]).toMatchObject({ word: '42', start: 0.9, end: 0.9 });
  });

  it('rejects files that are not WhisperX output', () => {
    expect(() => parseWhisperX({}, 'x')).toThrow(/segments/);
    expect(() => parseWhisperX({ segments: [{ start: 'a', end: 1, text: 'x' }] }, 'x')).toThrow(/Segment 0/);
    expect(() => parseWhisperX({ segments: [] }, 'x')).toThrow(/no segments/);
  });
});
