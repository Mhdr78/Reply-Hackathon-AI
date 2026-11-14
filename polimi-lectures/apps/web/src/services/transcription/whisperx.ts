import type { Transcript, TranscriptSegment } from '@/types/domain';

/** Raw WhisperX output (after alignment + optional diarization). Fields can be missing, e.g. words without timestamps for numerals. */
export interface WhisperXOutput {
  language?: string;
  /** Optional, not produced by WhisperX: display names, e.g. { "SPEAKER_00": "Prof. Colombo" }. */
  speakers?: Record<string, string>;
  segments: {
    start: number;
    end: number;
    text: string;
    speaker?: string;
    words?: { word: string; start?: number; end?: number; score?: number; speaker?: string }[];
  }[];
}

/** Validate unknown JSON (e.g. an uploaded file) and normalize it. Throws a readable Error if the shape is wrong. */
export function parseWhisperX(json: unknown, lectureId: string): Transcript {
  const raw = json as WhisperXOutput;
  if (!raw || !Array.isArray(raw.segments)) throw new Error('Not a WhisperX file: missing "segments" array.');
  raw.segments.forEach((s, i) => {
    s.start = Number(s.start);
    s.end = Number(s.end);
    if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || typeof s.text !== 'string') {
      throw new Error(`Segment ${i} needs numeric "start"/"end" and a "text" string.`);
    }
    s.words = (s.words ?? []).map((w) => ({
      ...w,
      start: w.start == null ? undefined : Number(w.start),
      end: w.end == null ? undefined : Number(w.end),
    }));
  });
  if (!raw.segments.length) throw new Error('The transcript has no segments.');
  return normalizeWhisperX(raw, lectureId);
}

/** Normalize raw WhisperX JSON into the app's Transcript schema: sorted, trimmed, stable ids, word timings filled in. */
export function normalizeWhisperX(raw: WhisperXOutput, lectureId: string): Transcript {
  const segments: TranscriptSegment[] = [...raw.segments]
    .sort((a, b) => a.start - b.start)
    .map((s, id) => {
      let prevEnd = s.start;
      const words = (s.words ?? []).map((w) => {
        const start = w.start ?? prevEnd;
        const end = w.end ?? start;
        prevEnd = end;
        return { word: w.word.trim(), start, end, score: w.score };
      });
      return { id, start: s.start, end: s.end, text: s.text.trim(), speaker: s.speaker, words };
    });
  return { lectureId, language: raw.language ?? 'en', segments, speakers: raw.speakers, engine: 'whisperx' };
}
