# Polimi Lectures

Watch Politecnico di Milano lecture recordings with a synchronized transcript, AI-generated chapters, the lecture's
PDFs, and an AI assistant you can ask about the whole lecture or a selected part of it.

```
apps/web/           React + TypeScript + Vite front end            → apps/web/README.md
services/chatbot/   LectureMind: Python API for answers, chats      → services/chatbot/README.md
                    and chapters (OpenRouter, SQLite, stdlib only)
docs/               ARCHITECTURE.md, API.md (backend contract), CHAPTERS.md
package.json        common tasks (`npm run <task>`, see below)
```

## Quick start

Requirements: Node 20.19+ (or 22.12+), Python 3.10+, and Poppler's `pdftotext` (`brew install poppler` or `apt install poppler-utils`).

```bash
npm run setup                                  # web dependencies (the chatbot has none)
cp services/chatbot/.env.example services/chatbot/.env   # set OPENROUTER_API_KEY and OPENROUTER_MODEL
npm run dev                                    # web on http://localhost:5173 + chatbot on :8787
```

Use `npm run dev:fake` to try the assistant without OpenRouter (canned answers). Sign in
with any 8-digit person code, a password of 6+ characters, and any 6-digit code.

**Lecture files** go in `apps/web/public/media/` and are git-ignored (see the README there):
`ml-01.mp4` (video), `ml-01.json` (WhisperX transcript), and `ml-01/materials.json` with its PDFs. The chatbot prepares
each lecture automatically from those files the first time its page is opened.

## Tasks

| Command | What it does |
|---|---|
| `npm run dev` / `npm run dev:fake` | Web app and chatbot server together (real or canned answers) |
| `npm run web` / `npm run chatbot` / `npm run chatbot:fake` | Run one part |
| `npm test` | Web unit tests (Vitest) and chatbot tests (unittest) |
| `npm run typecheck` / `npm run build` | Type check / production build of the web app |

The root `package.json` has no dependencies: it only runs tasks in `apps/web` and `services/chatbot`.

## Configuration

| Where | Setting | Default |
|---|---|---|
| `services/chatbot/.env` | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | required for real answers |
| chatbot flags | `--media-dir`, `--data-dir`, `--port`, `--model`, `--fake-llm` | `apps/web/public/media`, `services/chatbot/data`, 8787 |
| `apps/web/.env` | `VITE_USE_MOCKS` | `true`: auth, courses, transcription and materials are mocked |
| | `VITE_CHATBOT_URL` | `/chatbot-api` (proxied). Empty = in-browser mock assistant |
| | `CHATBOT_SERVER` | `http://127.0.0.1:8787` (dev proxy target) |
| | `VITE_LECTURE_VIDEO_URL`, `VITE_API_BASE_URL` | fallback video, future backend |

Secrets live only in `services/chatbot/.env`. The browser never sees the OpenRouter key.

## What's real and what's mocked

| Area | Status | Source today |
|---|---|---|
| Assistant answers, chats, follow-up memory | **Real (AI)** | `services/chatbot` → OpenRouter. Chats stored in SQLite |
| Chapters (titles + boundaries) | **Real (AI)** for lectures with a transcript and slides | `services/chatbot` (LLM). Other lectures: mock heuristics in the browser |
| Transcript ↔ slide page links | Real, heuristic (not AI) | Lexical matcher in the chatbot, plus `links` in `materials.json` |
| Login (credentials + OTP) | Mock | `mockAuthProvider`: any well-formed input |
| Student profile, term, courses, lectures | Mock | `apps/web/src/mocks/courses.ts` |
| Transcription jobs and statuses | Mock | In-browser simulated queue |
| Transcripts | Mock, except files you add | `public/media/<id>.json`, otherwise generated sample text |
| Videos | Local files | `public/media/<id>.mp4` or `VITE_LECTURE_VIDEO_URL`, otherwise simulated playback |
| Lecture PDFs (materials) | Mock list | `public/media/<id>/materials.json` (hand-written) |
| Chapter summaries | Mock only | The LLM chapters have titles only |

## Documentation

- [Architecture](docs/ARCHITECTURE.md): how the parts talk to each other, and their boundaries
- [Backend API contract](docs/API.md): main backend (future) and the chatbot API
- [Chapters](docs/CHAPTERS.md): sources, LLM generation, fallbacks
- [Web app](apps/web/README.md) · [Chatbot](services/chatbot/README.md)

## Starting a git repository

```bash
git init && git add . && git commit -m "Polimi Lectures: web app + LectureMind chatbot"
```

Check `git status` first: `.env` files, lecture media, `node_modules` and the chatbot's `data/` are ignored on purpose.
