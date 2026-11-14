# Architecture

```
Browser ─► apps/web (React, Vite dev server :5173)
             │  /media/*          static lecture files (video, transcript, materials.json, PDFs)
             │  /chatbot-api/*  ─► services/chatbot (Python, :8787) ─► OpenRouter (LLM)
             │                       ├─ reads apps/web/public/media to prepare lectures
             │                       └─ data/: prepared/<id>.sqlite3 (lecture + chapters), chats.sqlite3
             └  /api/* (future)  ─► main backend: Polimi SSO, courses, transcription jobs, materials
```

## Responsibilities

| Part | Owns | Does not own |
|---|---|---|
| `apps/web` | UI, playback state, selection, rendering citations, mock services for parts without a backend | Secrets, LLM calls, persistence (except mock data in the browser) |
| `services/chatbot` | Lecture preparation (PDF text, transcript↔slide links), prompts, LLM calls, chapters, chat history | Video, auth, course catalogue, transcription |
| Future backend (`docs/API.md`) | Auth (Polimi SSO + MFA), courses/lectures, transcription jobs, materials | Answering questions (delegated to the chatbot) |

## Boundaries

- **Typed contracts:** the web app talks to every capability through an interface in `apps/web/src/services/*`. A
  registry (`services/index.ts`) picks mock or real implementations from env vars, so components never know the
  difference.
- **One way in for the chatbot:** `services/chatbotApi.ts` is the only place that knows the chatbot's URL and maps its
  errors (for example "server not running") to `AppError`.
- **The chatbot is layered:** `server/http.py` handles JSON, routing and CORS → `server/service.py` holds the use
  cases → domain modules (`sources`, `selection`, `prompts`, `chapters`, `llm`) → storage (`server/registry.py`,
  `server/chats.py`, SQLite). The CLI (`cli.py`) reuses the same domain modules.
- **Normalization at the edges:** WhisperX output goes through `parseWhisperX` (web) and `normalize_transcript`
  (chatbot); LLM chapters through `validate_chapters` (chatbot) and `normalizeChapters` (web).

## Data flow: a question about a selected segment

1. The student selects text in the transcript (mapped to word timestamps) or drags on the seek bar.
2. `ChatPanel` sends `POST /chatbot-api/api/chats/:id/messages {content, selection}`.
3. The server loads the prepared lecture (preparing it first if needed), extracts the selected words and linked slide
   pages, and adds the chat's last 10 messages. It sends everything to OpenRouter and stores the question and answer
   only if that call succeeds.
4. The answer is Markdown. `[m:ss]` chips seek the video, and `[PDF p. N]` chips open the slides at that page.
