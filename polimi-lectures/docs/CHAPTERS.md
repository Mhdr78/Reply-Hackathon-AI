# Lecture chapters

YouTube-style chapters on the lecture page: a segmented seek bar with hover previews, the current chapter next to
the time, a *Chapters* tab in the transcript panel, and inline chapter headings in the transcript.

## Data model (`apps/web/src/types/domain.ts`)

```ts
interface Chapter        { id: string; start: number; end: number; title: string; summary?: string }
interface LectureChapters { lectureId: string; source: 'mock' | 'llm' | 'manual'; model?: string; createdAt?: string; chapters: Chapter[] }
```

Chapters are contiguous: the first starts at `0`, and each ends where the next begins. The last one ends at the end of
the transcript; the seek bar stretches it to the end of the video.

## Flow

```
transcript ready ──▶ useChapters(transcript) ──▶ services.chapters.getChapters(transcript)
   chatbot server configured (default):
     POST /chatbot-api/api/lectures/:id/chapters      saved chapters, or the LLM segments the lecture once
                                                       (result saved in its database)
     409 NOT_PREPARED (no transcript/slides) / offline → mock chapters (placeholder titles)
   VITE_CHATBOT_URL= (empty): mock chapters, or GET /lectures/:id/chapters on the main API when VITE_USE_MOCKS=false
```

The components only use `ChapterService` and `Chapter[]`. Whatever the source, chapters are passed through
`normalizeChapters` (`apps/web/src/services/chapters/chapterizer.ts`), so they line up with the transcript shown in the app.

## LLM chapters (chatbot)

`services/chatbot` (`lecturemind/chapters.py`) segments the lecture with the LLM (`CHAPTER_SYSTEM`). The model gets the transcript segments, the
PDF page titles and the time→page links, and returns `{ "chapters": [{ "title", "start_segment_id" }] }`.
`validate_chapters` checks that response: segment ids must exist, starts must be chronological, and the first chapter must
start at the first segment. The result is saved in the lecture database (`lecture_chapters` table). Running `prepare` again
clears it.

- **In the app:** generated automatically the first time a prepared lecture is opened (one LLM call per lecture, then
  cached). **Regenerate** in the Chapters tab replaces them (`POST …/chapters {"force": true}`). The server allows only one
  generation per lecture at a time.
- **From the command line** (in `services/chatbot`, on a database made with `prepare`):
  ```bash
  python lecture_cli.py generate-chapters                # generate, or print the saved ones
  python lecture_cli.py generate-chapters --force        # replace
  python lecture_cli.py generate-chapters --duration 901 # end the last chapter at the real video length
  python lecture_cli.py chapters                         # print the saved ones
  ```
- **`--fake-llm` server:** returns evenly spaced "Fake chapter" titles and never saves them.
- **Preparation is automatic:** the server prepares a lecture from `apps/web/public/media/<id>.json` and its `materials.json`
  slides the first time it is opened, including the PDF page titles the chapter prompt uses. Changing those files
  re-prepares the lecture and clears its chapters, so they are regenerated on the next visit.

LLM chapters have no summaries, so the list shows titles only. The UI stretches the last chapter to the end of the video.

## Mock chapters

Used for lectures the chatbot hasn't prepared, or when the server is offline:

- `apps/web/src/mocks/chapters.ts`: boundaries from pauses and speaker changes (`planBoundaries`), titles from a curated topic list
  (with a key-phrase fallback), and summaries from the most representative sentence.
- `apps/web/src/services/chapters/ChapterService.ts`: `mockChapterService`, `chatbotChapterService` and `httpChapterService`.
