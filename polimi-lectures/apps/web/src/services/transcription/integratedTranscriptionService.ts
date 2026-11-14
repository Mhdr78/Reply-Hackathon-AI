import { chatbotCall } from '@/services/chatbotApi';
import type { Transcript, TranscriptionJob } from '@/types/domain';
import type { TranscriptionService } from './TranscriptionService';
export const integratedTranscriptionService: TranscriptionService = {
  getJob: (id) => chatbotCall<TranscriptionJob>(`/lectures/${encodeURIComponent(id)}/transcription`),
  requestTranscription: (id) => chatbotCall<TranscriptionJob>(`/lectures/${encodeURIComponent(id)}/transcription`, { method: 'POST' }),
  getTranscript: (id) => chatbotCall<Transcript>(`/lectures/${encodeURIComponent(id)}/transcript`),
  subscribe(id, onUpdate) {
    let alive = true, previous = '';
    const timer = setInterval(() => {
      void this.getJob(id).then((job) => {
        const key = `${job.status}:${job.progress}:${job.error}`;
        if (alive && key !== previous) { previous = key; onUpdate(job); }
        if (job.status === 'completed') clearInterval(timer);
      }).catch(() => {});
    }, 2000);
    return () => { alive = false; clearInterval(timer); };
  },
};
