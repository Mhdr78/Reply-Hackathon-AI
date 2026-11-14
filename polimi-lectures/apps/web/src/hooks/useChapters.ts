import { useCallback, useEffect, useMemo, useState } from 'react';
import { services } from '@/services';
import { toAppError, type AppError } from '@/lib/errors';
import type { LectureChapters, Transcript } from '@/types/domain';

export type ChaptersState =
  | { status: 'idle' } // no transcript yet
  | { status: 'loading' }
  | { status: 'unavailable' } // backend has not generated chapters yet
  | { status: 'ready'; data: LectureChapters }
  | { status: 'error'; error: AppError };

/** Loads chapters once a transcript is available (and again if a different transcript is loaded). */
export function useChapters(transcript: Transcript | undefined) {
  const [state, setState] = useState<ChaptersState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!transcript) return setState({ status: 'idle' });
    let alive = true;
    setState({ status: 'loading' });
    services.chapters.getChapters(transcript).then(
      (data) => alive && setState(data.chapters.length ? { status: 'ready', data } : { status: 'unavailable' }),
      (e) => {
        if (!alive) return;
        const error = toAppError(e);
        setState(error.code === 'NOT_FOUND' ? { status: 'unavailable' } : { status: 'error', error });
      },
    );
    return () => { alive = false; };
  }, [transcript, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  /** Replace saved chapters with freshly generated ones (LLM-backed services only). */
  const regenerate = useMemo(() => {
    const fn = services.chapters.regenerate;
    if (!fn || !transcript || state.status !== 'ready' || state.data.source === 'mock') return undefined;
    return async () => {
      setState({ status: 'loading' });
      try {
        setState({ status: 'ready', data: await fn(transcript) });
      } catch (e) {
        setState({ status: 'error', error: toAppError(e) });
      }
    };
  }, [transcript, state]);

  const chapters = state.status === 'ready' ? state.data.chapters : undefined;
  return { state, chapters, retry, regenerate };
}
