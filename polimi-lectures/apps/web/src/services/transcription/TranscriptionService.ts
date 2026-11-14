import type { Transcript, TranscriptionJob } from '@/types/domain';

/**
 * Transcription contract. The transcription engine (WhisperX or anything else) lives behind the backend;
 * the frontend never calls it directly and never waits for it synchronously.
 *
 * Flow: getJob → (not_started) requestTranscription → subscribe for updates → getTranscript when completed.
 */
export interface TranscriptionService {
  getJob(lectureId: string): Promise<TranscriptionJob>;
  /** Enqueue a background job (idempotent: returns the existing job if already queued/processing/completed). */
  requestTranscription(lectureId: string): Promise<TranscriptionJob>;
  getTranscript(lectureId: string): Promise<Transcript>;
  /** Push-style status updates (SSE/WebSocket in production, polling fallback). Returns an unsubscribe function. */
  subscribe(lectureId: string, onUpdate: (job: TranscriptionJob) => void): () => void;
}
