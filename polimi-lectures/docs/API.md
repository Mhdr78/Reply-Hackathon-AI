# Backend API contract

The frontend calls these endpoints when `VITE_USE_MOCKS=false`. Base URL: `VITE_API_BASE_URL`.
Types refer to `apps/web/src/types/domain.ts`. Errors: non-2xx with body `{ "code": ErrorCode, "message": string }`.

## Auth (backend brokers Polimi SSO + MFA)
| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/login` | `{ personCode, password }` | `LoginStep` — `{type:"otp_required", challengeId, method, hint?}` or `{type:"authenticated", session}` |
| POST | `/auth/otp` | `{ challengeId, code }` | `Session` (also sets an httpOnly session cookie) |
| GET | `/auth/session` | – | `Session` or 401 |
| POST | `/auth/logout` | – | 204 |

## Courses
| Method | Path | Response |
|---|---|---|
| GET | `/terms/:termId/courses` | `Course[]` |
| GET | `/courses/:id` | `Course` |
| GET | `/courses/:id/lectures` | `Lecture[]` |
| GET | `/lectures/:id` | `Lecture` (`videoUrl` should be a short-lived signed URL or a proxied stream) |

## Transcription (async jobs)
| Method | Path | Response |
|---|---|---|
| GET | `/lectures/:id/transcription` | `TranscriptionJob` (`status`: not_started, queued, processing, completed or failed; `progress` 0..1) |
| POST | `/lectures/:id/transcription` | `TranscriptionJob`. Enqueues a job; **idempotent**; returns 202 quickly |
| GET | `/lectures/:id/transcription/events` | SSE stream; each `data:` is a `TranscriptionJob` JSON. Client falls back to polling every 3 s |
| GET | `/lectures/:id/transcript` | `Transcript` (404 until completed) |

Recommended backend flow: POST → put job in queue (Redis/RQ, Celery, BullMQ, etc.) → worker downloads the audio and runs the
WhisperX module → stores raw output → normalizes with the same rules as `apps/web/src/services/transcription/whisperx.ts` → marks the job
`completed` and publishes an event.

## Chapters (LLM-generated, see docs/CHAPTERS.md)
| Method | Path | Response |
|---|---|---|
| GET | `/lectures/:id/chapters` | `LectureChapters` `{ lectureId, source: "llm" or "manual", model?, createdAt?, chapters: [{ id, start, end, title, summary? }] }`. 404 while not generated yet (the UI shows "No chapters yet") |

## Lecture materials
| Method | Path | Response |
|---|---|---|
| GET | `/lectures/:id/materials` | `LectureMaterial[]`: `{ id, title, url, fileName, kind?, description?, links?: [{ start, end, page }] }` |

## Chat and chapters: `services/chatbot` (separate service, proxied at `/chatbot-api`)
Chats are persisted in SQLite. Each answer uses the lecture's full transcript and PDF text, the chat's last 10 messages
(follow-up memory) and the optional selection.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/health` | – | `{ ok, fake_llm, lectures }` |
| GET | `/api/lectures/:id` | – | `{ lecture_id, prepared, pdf?, segments?, pages?, reason? }`. Prepares the lecture from `apps/web/public/media` on first use |
| GET | `/api/lectures/:id/chapters` | – | `{ lectureId, source: "llm", durationS, durationSource, chapters: [{ id, title, start, end, startSegmentId }] }`. 404 `NOT_GENERATED` until generated |
| POST | `/api/lectures/:id/chapters` | `{ force? }` | Same shape. Generates with the LLM and saves the result (returns the saved chapters unless `force`). With `--fake-llm`: `source: "fake"`, not saved |
| GET | `/api/lectures/:id/chats` | – | `ChatThread[]` (most recent first) |
| POST | `/api/lectures/:id/chats` | `{ title? }` | `ChatThread` (201) |
| GET | `/api/chats/:chatId/messages` | – | `ChatMessage[]` |
| POST | `/api/chats/:chatId/messages` | `{ content, selection?: { start, end } }` | `{ chat, user, assistant }`. Both messages are stored only if the answer succeeded |
| PATCH | `/api/chats/:chatId` | `{ title }` | `ChatThread` |
| DELETE | `/api/chats/:chatId` | – | 204 |

Errors: `{ code, message }`, with codes `BAD_REQUEST` (400, e.g. "No spoken text overlaps that range"), `NOT_FOUND` (404),
`NOT_PREPARED` (409, no transcript or slides for the lecture; `message` says which) and `LLM_FAILED` (502, OpenRouter error).
Answers are Markdown. Citations are inline: `[m:ss]`, `[m:ss-m:ss]` and `[PDF p. N]` (the prompt asks the model for this format).
