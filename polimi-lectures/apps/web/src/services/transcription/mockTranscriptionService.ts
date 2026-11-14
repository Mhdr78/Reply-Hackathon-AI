import { config } from '@/config';
import { AppError } from '@/lib/errors';
import { sleep } from '@/lib/format';
import { initialTranscriptionStatus, mockLectures } from '@/mocks/courses';
import { buildMockTranscript } from '@/mocks/transcripts';
import { localTranscriptUrl, mediaExists } from '@/mocks/media';
import { parseWhisperX } from './whisperx';
import type { TranscriptionJob, TranscriptionStatus } from '@/types/domain';
import type { TranscriptionService } from './TranscriptionService';

/**
 * In-browser simulation of a backend job queue (queued → processing with progress → completed).
 * The first retry of a failed job succeeds. Replace with httpTranscriptionService to use the real module.
 */
const jobs = new Map<string, TranscriptionJob>();
const listeners = new Map<string, Set<(j: TranscriptionJob) => void>>();
const running = new Set<string>();

function lectureOrThrow(id: string) {
  const l = mockLectures.find((x) => x.id === id);
  if (!l) throw new AppError('NOT_FOUND');
  return l;
}

function jobFor(id: string): TranscriptionJob {
  let job = jobs.get(id);
  if (!job) {
    const status = initialTranscriptionStatus(lectureOrThrow(id));
    job = {
      lectureId: id,
      status,
      progress: status === 'processing' ? 0.35 : undefined,
      error: status === 'failed' ? 'Audio track could not be decoded (mock error).' : undefined,
      updatedAt: new Date().toISOString(),
    };
    jobs.set(id, job);
    if (status === 'processing') void run(id, 0.35);
  }
  return job;
}

/** A WhisperX file in public/media/<id>.json means "already transcribed". */
async function ensureJob(id: string) {
  if (!jobs.has(id) && (await mediaExists(localTranscriptUrl(id), 'json'))) {
    lectureOrThrow(id);
    jobs.set(id, { lectureId: id, status: 'completed', progress: 1, updatedAt: new Date().toISOString() });
  }
  return jobFor(id);
}

function emit(id: string, patch: Partial<TranscriptionJob> & { status: TranscriptionStatus }) {
  const job = { ...jobFor(id), ...patch, updatedAt: new Date().toISOString() };
  if (patch.status !== 'failed') delete job.error;
  jobs.set(id, job);
  listeners.get(id)?.forEach((fn) => fn(job));
}

async function run(id: string, from = 0) {
  if (running.has(id)) return;
  running.add(id);
  if (from === 0) {
    emit(id, { status: 'queued', progress: undefined });
    await sleep(config.mockTranscriptionMs * 0.2);
  }
  const steps = 12;
  for (let i = Math.round(from * steps); i <= steps; i++) {
    emit(id, { status: 'processing', progress: i / steps });
    await sleep((config.mockTranscriptionMs * 0.8) / steps);
  }
  emit(id, { status: 'completed', progress: 1 });
  running.delete(id);
}

export const mockTranscriptionService: TranscriptionService = {
  async getJob(id) {
    await sleep(config.mockLatencyMs / 2);
    return ensureJob(id);
  },
  async requestTranscription(id) {
    await sleep(config.mockLatencyMs / 2);
    const job = await ensureJob(id);
    if (job.status === 'not_started' || job.status === 'failed') void run(id);
    return jobs.get(id)!;
  },
  async getTranscript(id) {
    await sleep(config.mockLatencyMs);
    if ((await ensureJob(id)).status !== 'completed') throw new AppError('NOT_FOUND', 'Transcript not available yet.');
    if (await mediaExists(localTranscriptUrl(id), 'json')) {
      const res = await fetch(localTranscriptUrl(id));
      try {
        return parseWhisperX(await res.json(), id);
      } catch (e) {
        throw new AppError('TRANSCRIPTION_FAILED', `public/media/${id}.json: ${e instanceof Error ? e.message : 'invalid JSON'}`);
      }
    }
    return buildMockTranscript(lectureOrThrow(id));
  },
  subscribe(id, onUpdate) {
    const set = listeners.get(id) ?? new Set();
    set.add(onUpdate);
    listeners.set(id, set);
    return () => set.delete(onUpdate);
  },
};
