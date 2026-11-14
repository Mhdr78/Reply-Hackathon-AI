import type { Chapter, Transcript, TranscriptSegment } from '@/types/domain';

/**
 * Pure helpers shared by every chapter source (mock heuristics today, an LLM tomorrow).
 *
 * The LLM only has to return `ChapterDraft[]` — a start time and a title per chapter. `normalizeChapters`
 * turns that (possibly sloppy) output into clean, contiguous chapters aligned to transcript segments,
 * so the UI never has to deal with overlaps, gaps, unsorted or out-of-range timestamps.
 * The backend should apply the same rules (see docs/CHAPTERS.md).
 */
export interface ChapterDraft {
  start: number;
  title: string;
  summary?: string;
}

export interface NormalizeOptions {
  /** Chapters shorter than this are merged into the previous one. YouTube uses 10 s; lectures read better with more. */
  minChapterSec?: number;
  /** Hard cap on title length (characters). */
  maxTitleLength?: number;
}

/** Index of the segment whose start is closest to `t`. */
function nearestSegment(segments: TranscriptSegment[], t: number) {
  let best = 0;
  for (let i = 1; i < segments.length; i++) {
    if (Math.abs(segments[i].start - t) < Math.abs(segments[best].start - t)) best = i;
  }
  return best;
}

export function normalizeChapters(drafts: ChapterDraft[], transcript: Transcript, opts: NormalizeOptions = {}): Chapter[] {
  const { minChapterSec = 20, maxTitleLength = 80 } = opts;
  const segs = transcript.segments;
  if (!segs.length) return [];
  const endOfLecture = segs.at(-1)!.end;
  const minLen = Math.min(minChapterSec, endOfLecture / 8); // short recordings still get a few chapters

  // 1. Clean titles, snap starts to segment boundaries, sort, drop duplicates.
  const snapped = drafts
    .filter((d) => Number.isFinite(Number(d.start)) && typeof d.title === 'string' && d.title.trim())
    .map((d) => {
      const idx = nearestSegment(segs, Number(d.start));
      const title = d.title.trim().replace(/\s+/g, ' ').replace(/[.。]$/, '');
      return {
        idx,
        title: title.length > maxTitleLength ? `${title.slice(0, maxTitleLength - 1).trimEnd()}…` : title,
        summary: d.summary?.trim() || undefined,
      };
    })
    .sort((a, b) => a.idx - b.idx)
    .filter((d, i, arr) => i === 0 || d.idx !== arr[i - 1].idx);

  if (!snapped.length) return [];

  // 2. The first chapter always starts at 0, like YouTube.
  snapped[0].idx = 0;

  // 3. Merge chapters that are too short into their predecessor.
  const kept: typeof snapped = [];
  for (const d of snapped) {
    const prev = kept.at(-1);
    if (prev && segs[d.idx].start - segs[prev.idx].start < minLen) continue;
    kept.push(d);
  }
  // The last chapter may also be too short: fold it into the previous one.
  if (kept.length > 1 && endOfLecture - segs[kept.at(-1)!.idx].start < minLen) kept.pop();

  // 4. Contiguous ranges.
  return kept.map((d, i) => ({
    id: `ch-${i + 1}`,
    start: i === 0 ? 0 : segs[d.idx].start,
    end: i < kept.length - 1 ? segs[kept[i + 1].idx].start : endOfLecture,
    title: d.title,
    summary: d.summary,
  }));
}

/**
 * Heuristic boundary detection, used by the mock (and handy as a fallback when the LLM is unavailable).
 * Picks ~one chapter every few minutes, preferring natural pauses and speaker changes near the ideal cut.
 * Returns segment indexes where chapters start (always including 0).
 */
export function planBoundaries(segments: TranscriptSegment[], { targetSec = 150, min = 3, max = 12 } = {}): number[] {
  if (segments.length < 2) return [0];
  const duration = segments.at(-1)!.end;
  const count = Math.max(min, Math.min(max, Math.round(duration / targetSec), segments.length));
  const step = duration / count;
  const window = step * 0.3;

  const cuts = [0];
  for (let k = 1; k < count; k++) {
    const ideal = k * step;
    let best = -1;
    let bestScore = -Infinity;
    for (let i = cuts.at(-1)! + 1; i < segments.length; i++) {
      const dist = Math.abs(segments[i].start - ideal);
      if (segments[i].start > ideal + window) break;
      if (dist > window) continue;
      const pause = segments[i].start - segments[i - 1].end;
      const speakerChange = segments[i].speaker !== segments[i - 1].speaker ? 0.4 : 0;
      const score = Math.min(pause, 3) + speakerChange - (dist / window) * 0.8;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best > 0) cuts.push(best);
  }
  return cuts;
}

/** Index of the chapter playing at time t (binary search), or -1. */
export function findChapterIndex(chapters: Chapter[], t: number): number {
  let lo = 0, hi = chapters.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (chapters[mid].start <= t + 0.05) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}
