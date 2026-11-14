import { useCallback, useEffect, useState } from 'react';
import { services } from '@/services';
import { AppError, toAppError } from '@/lib/errors';
import type { Transcript, TranscriptionJob } from '@/types/domain';

/**
 * Orchestrates the transcription workflow for one lecture:
 * check job → fetch transcript if completed → otherwise enqueue a background job → follow status updates → fetch when done.
 */
export function useTranscription(lectureId: string, { autoStart = true } = {}) {
  const [job, setJob] = useState<TranscriptionJob>();
  const [transcript, setTranscript] = useState<Transcript>();
  const [error, setError] = useState<AppError>();

  useEffect(() => {
    let alive = true;
    const svc = services.transcription;
    setJob(undefined);
    setTranscript(undefined);
    setError(undefined);

    const load = () =>
      svc.getTranscript(lectureId).then((t) => alive && setTranscript(t), (e) => alive && setError(toAppError(e)));

    const unsubscribe = svc.subscribe(lectureId, (j) => {
      if (!alive) return;
      setJob(j);
      if (j.status === 'completed') load();
    });

    svc
      .getJob(lectureId)
      .then(async (j) => {
        if (!alive) return;
        setJob(j);
        if (j.status === 'completed') return load();
        if (j.status === 'not_started' && autoStart) setJob(await svc.requestTranscription(lectureId));
      })
      .catch((e) => alive && setError(toAppError(e)));

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [lectureId, autoStart]);

  const retry = useCallback(async () => {
    setError(undefined);
    try {
      setJob(await services.transcription.requestTranscription(lectureId));
    } catch (e) {
      setError(toAppError(e));
    }
  }, [lectureId]);

  return { job, transcript, error, retry };
}

/** Lightweight status-only subscription, used in lecture lists. */
export function useTranscriptionStatus(lectureId: string) {
  const [job, setJob] = useState<TranscriptionJob>();
  useEffect(() => {
    let alive = true;
    const unsub = services.transcription.subscribe(lectureId, (j) => alive && setJob(j));
    services.transcription.getJob(lectureId).then((j) => alive && setJob(j)).catch(() => {});
    return () => {
      alive = false;
      unsub();
    };
  }, [lectureId]);
  return job;
}
