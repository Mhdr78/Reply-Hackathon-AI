import { describe, expect, it } from 'vitest';
import type { Transcript } from '@/types/domain';
import { findChapterIndex, normalizeChapters, planBoundaries } from './chapterizer';

const transcript: Transcript = {
  lectureId: 'demo',
  language: 'en',
  segments: [0, 30, 60, 90, 120, 150].map((start, id) => ({ id, start, end: start + 25, text: `segment ${id}`, words: [] })),
};

describe('normalizeChapters', () => {
  it('snaps starts to segments, sorts, starts at 0 and makes chapters contiguous', () => {
    const chapters = normalizeChapters(
      [{ start: 92, title: 'Third.' }, { start: 3, title: '  First ' }, { start: 58, title: 'Second' }],
      transcript,
    );
    expect(chapters.map((c) => [c.start, c.end, c.title])).toEqual([
      [0, 60, 'First'],
      [60, 90, 'Second'],
      [90, 175, 'Third'],
    ]);
  });

  it('merges chapters shorter than the minimum into the previous one', () => {
    const long: Transcript = { ...transcript, segments: Array.from({ length: 20 }, (_, id) => ({ id, start: id * 30, end: id * 30 + 25, text: 's', words: [] })) };
    const chapters = normalizeChapters([{ start: 0, title: 'A' }, { start: 30, title: 'B' }, { start: 120, title: 'C' }], long, { minChapterSec: 40 });
    expect(chapters.map((c) => c.title)).toEqual(['A', 'C']);
  });

  it('caps the minimum at 1/8 of the recording, so short lectures keep several chapters', () => {
    const chapters = normalizeChapters([{ start: 0, title: 'A' }, { start: 30, title: 'B' }], transcript, { minChapterSec: 40 });
    expect(chapters.map((c) => c.title)).toEqual(['A', 'B']);
  });

  it('drops drafts without a title and returns [] for an empty transcript', () => {
    expect(normalizeChapters([{ start: 0, title: ' ' }], transcript)).toEqual([]);
    expect(normalizeChapters([{ start: 0, title: 'A' }], { ...transcript, segments: [] })).toEqual([]);
  });
});

describe('findChapterIndex', () => {
  const chapters = normalizeChapters([{ start: 0, title: 'A' }, { start: 60, title: 'B' }], transcript);
  it('returns the chapter playing at a time', () => {
    expect(findChapterIndex(chapters, 0)).toBe(0);
    expect(findChapterIndex(chapters, 59.9)).toBe(0);
    expect(findChapterIndex(chapters, 61)).toBe(1);
    expect(findChapterIndex([], 10)).toBe(-1);
  });
});

describe('planBoundaries', () => {
  it('always starts at the first segment and returns increasing indexes', () => {
    const cuts = planBoundaries(transcript.segments, { targetSec: 50, min: 3 });
    expect(cuts[0]).toBe(0);
    expect([...cuts].sort((a, b) => a - b)).toEqual(cuts);
    expect(new Set(cuts).size).toBe(cuts.length);
  });
});
