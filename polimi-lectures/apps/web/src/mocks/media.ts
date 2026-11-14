/**
 * Local media overrides for demo mode.
 * Put files in public/media/ named after the lecture id:
 *   public/media/ml-01.mp4    → video for lecture ml-01
 *   public/media/ml-01.json   → WhisperX output for lecture ml-01 (marks its transcription as completed)
 */
const cache = new Map<string, Promise<boolean>>();

/** True if the file exists. Checks the content type, because the dev server answers unknown paths with index.html. */
export function mediaExists(url: string, kind: 'video' | 'json'): Promise<boolean> {
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url, { method: 'HEAD' })
        .then((r) => {
          const ct = r.headers.get('content-type') ?? '';
          return r.ok && (kind === 'video' ? ct.startsWith('video/') : ct.includes('json'));
        })
        .catch(() => false),
    );
  }
  return cache.get(url)!;
}

export const localVideoUrl = (lectureId: string) => `/media/${lectureId}.mp4`;
export const localTranscriptUrl = (lectureId: string) => `/media/${lectureId}.json`;
