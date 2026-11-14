import { config } from '@/config';
import { http } from '@/lib/http';
import type { Transcript, TranscriptionJob } from '@/types/domain';
import type { TranscriptionService } from './TranscriptionService';

/**
 * REST + SSE adapter. The backend owns the job queue and calls the transcription module (WhisperX) in a worker.
 * See docs/API.md for the exact contract.
 */
export const httpTranscriptionService: TranscriptionService = {
  getJob: (id) => http<TranscriptionJob>(`/lectures/${id}/transcription`),
  requestTranscription: (id) => http<TranscriptionJob>(`/lectures/${id}/transcription`, { method: 'POST' }),
  getTranscript: (id) => http<Transcript>(`/lectures/${id}/transcript`),
  subscribe(id, onUpdate) {
    // Prefer Server-Sent Events; fall back to polling if the endpoint is unavailable.
    let timer: ReturnType<typeof setInterval> | undefined;
    const es = new EventSource(`${config.apiBaseUrl}/lectures/${id}/transcription/events`, { withCredentials: true });
    es.onmessage = (e) => onUpdate(JSON.parse(e.data) as TranscriptionJob);
    es.onerror = () => {
      es.close();
      timer ??= setInterval(() => this.getJob(id).then(onUpdate).catch(() => {}), 3000);
    };
    return () => {
      es.close();
      if (timer) clearInterval(timer);
    };
  },
};
