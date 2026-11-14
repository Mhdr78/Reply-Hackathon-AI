# Web app (`apps/web`)

React + TypeScript + Vite dashboard: sign in, browse this term's courses, open a lecture, and watch it while the
transcript follows along, with AI chapters, segment questions and lecture PDFs.
See the [repository README](../../README.md) for setup and how the parts fit together.

```bash
npm install
cp .env.example .env            # optional; defaults work
npm run dev                     # http://localhost:5173 (start the chatbot server too: `npm run chatbot` from the root)
npm test                        # unit tests (Vitest)
```

**Demo login:** use any 8-digit person code (e.g. `10712345`) with a password of at least 6 characters, then any 6-digit code.
Two inputs fail on purpose so you can see the error states: password `wrongpass` and code `000000`.

### Using your own videos and transcripts

You have two options, and you can mix them:

**1. Folder (persistent).** Put files in `public/media/`, named after the lecture id from the URL (`/lectures/ml-01` → `ml-01`):

```
public/media/ml-01.mp4     # video for that lecture (H.264 MP4 plays everywhere)
public/media/ml-01.json    # WhisperX output for that lecture
```

A lecture with a `.json` there is shown as **Transcript ready**, and the app loads your file instead of the generated sample. Without an `.mp4`, it falls back to `VITE_LECTURE_VIDEO_URL`. Reload the page after adding files.

**2. In the app (temporary).** On any lecture page, click **Load files** or drag files onto the page. You can load a video, a `.json` transcript, or both. They stay in your browser only: nothing is uploaded, and they're gone after a reload or **Reset**.

**Transcript format:** use the raw WhisperX JSON (`result` after `whisperx.align`, plus `assign_word_speakers` if you diarize):

```json
{
  "language": "en",
  "speakers": { "SPEAKER_00": "Prof. Colombo", "SPEAKER_01": "Student" },
  "segments": [
    { "start": 0.52, "end": 4.8, "text": "Today we…", "speaker": "SPEAKER_00",
      "words": [{ "word": "Today", "start": 0.52, "end": 0.91 }] }
  ]
}
```

`segments[].start`, `end` and `text` are required. `words` (for word highlighting), `speaker` and the top-level `speakers` names are optional. Words without timestamps, which WhisperX produces for numbers, are handled. From Python: `json.dump(result, open("ml-01.json", "w"))`.

### AI assistant

Answers, chats and chapters come from the chatbot server in [`services/chatbot`](../../services/chatbot/README.md),
which the dev server proxies at `/chatbot-api`. It prepares each lecture automatically from the files in `public/media`
(next section). If it runs elsewhere, set `CHATBOT_SERVER=http://host:port` in `.env`. To use the in-browser mock
assistant instead, set `VITE_CHATBOT_URL=` (empty).

**Asking about a part of the lecture:**
- **Short parts:** select text in the transcript, then click **Ask AI** in the toolbar that appears. The range is exact to the word.
- **Long parts:** **Shift+drag** on the video timeline, or click the scissors (**Select part**) in the player and then drag.
- **A whole chapter:** hover it in the **Chapters** tab and click **Ask AI**.

The selection shows under the video (Play / Ask AI / clear) and is attached to your next question. Questions without a selection are about the whole lecture. Each lecture can have several chats. They persist on the server, can be continued later, renamed or deleted, and each one remembers its earlier questions for follow-ups.

### Lecture materials (PDFs)

On a lecture page, the left sidebar shows **Lecture materials**. For now they are mock files read from `public/media/<lectureId>/`:

```
public/media/ml-01/materials.json
public/media/ml-01/02 - Perceptron2NeuralNetworks.pdf
public/media/ml-01/ml-01-lecture-notes.pdf
```

```json
{
  "files": [
    {
      "file": "02 - Perceptron2NeuralNetworks.pdf",
      "title": "From Perceptrons to Feed-Forward Neural Networks",
      "kind": "slides",
      "description": "Slide deck used in this lecture.",
      "links": [ { "start": 94.4, "end": 289.3, "page": 17 } ]
    },
    { "file": "ml-01-lecture-notes.pdf", "title": "Lecture notes (auto-generated draft)", "kind": "notes" }
  ]
}
```

- `file`: a file name in that folder, or an absolute URL. Required.
- `title`, `kind` (`slides`, `notes`, `exercises` or `other`) and `description`: optional.
- `links`: optional time→page links. While the video plays inside a linked range, the sidebar shows **Now: p. N**. It also accepts the chatbot's `reviewed_links.json` shape (`start_s`, `end_s`, `page_number`), so you can paste that file's content.

PDFs open in an in-app viewer. `[PDF p. N]` citations in assistant answers open the lecture's slides (the first `kind: "slides"` file) at that page. Lectures without a `materials.json` show "No PDFs for this lecture yet". The real backend will serve the same list from `GET /lectures/:id/materials`.

If the video file is missing, the player shows **Simulate playback with transcript**. This runs a virtual clock, so you can still test transcript sync without a video.

Other scripts: `npm run build` (type-check and production build), `npm run preview`, `npm run typecheck`, `npm run test:watch`.

## Stack and why

| Choice | Reason |
|---|---|
| **React 19 + TypeScript + Vite** | Fast dev loop and a large ecosystem. Type-safe contracts are shared between the UI and the services. |
| **React Router** | Real URLs for each course and lecture, plus deep links like `/lectures/ml-01?t=180`. |
| **Tailwind CSS v4** | Keeps the design consistent with no hand-written CSS files to maintain. |
| **lucide-react** | A clean, consistent icon set. |
| **No state library** | A small external store (`useSyncExternalStore`) holds playback state. Plain hooks handle data. Nothing more is needed yet. |

The UI only talks to the **service interfaces** in `src/services/`. `VITE_USE_MOCKS` switches auth, courses, transcription and materials between in-browser mocks and HTTP adapters written against [`docs/API.md`](../../docs/API.md). The assistant and chapters use the chatbot server independently (`VITE_CHATBOT_URL`).

## Architecture

```
UI (features/*) ──► hooks (useAsync, useTranscription, useChapters) ──► services registry (services/index.ts)
                                                                        ├─ auth, courses, transcription, materials:
                                                                        │    mock* (in-browser) or http* (future backend)
                                                                        └─ chat, chapters: chatbot server (/chatbot-api)
                                                                             → services/chatbot → OpenRouter
```

- **Playback state** (`features/lecture/playback.tsx`): the video player, transcript and chat share one store. Components subscribe with selectors, so the transcript re-renders only when the active segment changes, and only the active segment re-renders for each word.
- **Transcription workflow** (`hooks/useTranscription.ts`): check the job. If it's completed, fetch the transcript. Otherwise enqueue a background job, subscribe to status updates (SSE, falling back to polling), and fetch the transcript once it's done. Nothing long-running happens inside a UI request.
- **Chat** is decoupled from transcription: the chatbot server keeps its own copy of the sources and the chat history. The panel sends `{content, selection?}` to a chat and renders Markdown answers whose `[m:ss]` / `[PDF p. N]` citations become links.
- **Chapters** from any source go through `normalizeChapters`, so the seek bar, chapter list and transcript headings always get clean, contiguous chapters.
- **Errors**: every service throws `AppError` (`lib/errors.ts`). Pages show inline error and retry states, and a root `ErrorBoundary` catches anything unexpected.
- **Config**: `src/config.ts` reads only `VITE_*` env vars. There are no secrets in the frontend.

## Project structure

```
src/
  types/domain.ts              Domain + API types (Course, Lecture, Transcript, TranscriptionJob, Chat…)
  config.ts                    Env-based config
  lib/                         errors, http client, formatting helpers
  services/
    index.ts                   Registry: mock vs http
    auth/                      AuthProvider interface, mock + http
    courses/                   CourseService interface, mock + http
    transcription/             TranscriptionService interface, mock queue, http (REST+SSE), WhisperX normalizer
    chapters/                  ChapterService: chatbot (LLM) + mock + http, chapterizer (normalization, heuristics)
    chat/                      ChatService interface: http (chatbot server) + mock (localStorage)
    chatbotApi.ts              Shared client for the chatbot server (offline detection)
    materials/                 MaterialService: lecture PDFs (mock reads public/media/<id>/materials.json)
  mocks/                       Realistic courses, lectures, WhisperX-style transcripts, mock chapter titles
  hooks/                       useAsync, useTranscription, useChapters
  components/                  AppShell + SidebarSlot (sidebar), Markdown (answers + citations), UI primitives, Logo
  features/
    auth/                      AuthContext, RequireAuth, LoginPage (credentials → OTP)
    dashboard/                 Courses grid, search, sort, stats
    course/                    Course details, lecture list with live transcription status
    lecture/                   LecturePage, VideoPlayer, TranscriptViewer, ChapterList, LectureMaterials (+ PDF viewer),
                               transcriptSelection, TranscriptionStatusPanel, playback store
    chat/                      ChatPanel (chat list, threads, selection chip, citations)
```

## Features

- **Login:** two steps (credentials, then OTP), with loading and error states. The password is cleared from memory after submission, and only an opaque token is kept.
- **Dashboard:** profile, current term, stats, and a course grid with code, CFU, instructors, recording count and last recording. Search covers name, code and instructor, and courses can be sorted. The sidebar collapses, and there's a mobile drawer.
- **Course page:** description, info panel, and a searchable lecture list with date, duration, room and a **live** transcription status. A course with no recordings shows an empty state.
- **Lecture page:**
  - **Custom player:** play/pause, ±10 s, seek bar, time and duration, speed from 0.75× to 2×, volume, full screen. Controls hide automatically, and there are keyboard shortcuts: `space`/`k`, `j`/`l`, `←`/`→`, `m`, `f`.
  - **Transcript:** timestamps and speaker labels. The active segment is highlighted, with **word-level** highlighting inside it. It auto-scrolls with a *Follow* toggle and a *Back to current* button, and clicking a segment seeks and plays. Search highlights matches with a counter, and you can step through them with Enter or Shift+Enter. You can also download the transcript as JSON.
  - **Chapters (YouTube-style):** the seek bar is split into chapter blocks; hovering shows the chapter title and time, and the current chapter is shown next to the time (click it to open the list). The transcript has a *Chapters* tab with titles, summaries, start times and a progress bar for the current chapter, and chapter headings appear inline in the transcript. `Shift+←`/`Shift+→` jumps between chapters. Chapters are **generated by the LLM** through the chatbot server (once per lecture, then cached, with a *Regenerate* button). Lectures without a transcript file and slides fall back to mock titles. See [`docs/CHAPTERS.md`](../../docs/CHAPTERS.md).
  - **Async states:** Not started → Queued → Processing (progress bar) → Completed (the transcript appears automatically), plus Failed with a Retry button.
  - Previous/next lecture navigation.
- **AI assistant panel:** a side panel on desktop and a bottom sheet on mobile, so it never covers the video or transcript on large screens. Several persistent chats per lecture (list, continue, rename, delete), follow-up memory, questions about a selected segment or the whole lecture, Markdown answers with clickable `[m:ss]` timestamps and `[PDF p. N]` slide links, retry on failure, and clear states when the server is offline or the lecture isn't prepared.
- **Segment selection:** transcript text selection (word-accurate), Shift+drag or *Select part* on the seek bar, or *Ask AI* on a chapter. The selected range is highlighted on the timeline and in the transcript, and can be played on its own.
- **Lecture materials:** PDFs in the left sidebar, a *Now: p. N* link that follows playback, and an in-app PDF viewer with page navigation.

The mock data is built so you can see every state:
- `ml-01` has a full, hand-written transcript.
- The latest lecture of each course isn't transcribed yet, so opening it starts the mock job.
- `ann-06` is already processing.
- `sec-04` has failed (retrying it succeeds).
- Recommender Systems has no recordings.

## What's mocked, next steps

See the [repository README](../../README.md#whats-real-and-whats-mocked).
