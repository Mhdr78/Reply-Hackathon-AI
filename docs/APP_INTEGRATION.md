# Integrated app and manual test

The default app now runs a single Python API on **127.0.0.1:8787**. It combines
RAG, original Whisper transcription, aligned translation, persistent chats,
chapter generation and local media. The existing React UI proxies requests to
that API. The standalone `rag.py serve` API remains available for separate use;
do not run it simultaneously against the same local Qdrant directory.

## Start

From the repository root, in two terminals:

```bash
.venv/bin/python run.py
```

```bash
cd polimi-lectures
npm run web
```

Or use `npm run dev` inside `polimi-lectures`. A new checkout first needs
`python -m venv --system-site-packages .venv`, `.venv/bin/python -m pip install -e '.[rag,test]'`
and `npm ci --prefix polimi-lectures/apps/web`. Set the OpenRouter key only in
repository-root `.env`. All model-backed routes read that same configuration.
The default chat/chapter/summary provider uses the shared RAG spending ledger;
translation retains its own existing $0.10 conservative per-request limit and
cache. These are not an account-wide wallet limit.

Open http://127.0.0.1:5173/lectures/ml-01. Authentication and the course catalog
remain explicit demo data: any 8-digit person code, a 6+ character password
other than `wrongpass`, and a 6-digit OTP other than `000000` work. These are
not real university credentials.

## Manual test

1. The current machine has the existing sample video, original transcript,
   slide PDF and previously validated Italian translation prepared under
   `.local/web/`. They are ignored by Git. In another checkout, use **Upload
   sources for AI** to provide an MP4, original JSON transcript and/or PDFs.
2. Confirm video playback and original transcript. Without a transcript, an
   uploaded MP4 is transcribed by local Whisper in a background thread. Status
   is polled; failures and retry appear in the existing status panel.
3. Change **Transcript language** to Italiano. A matching saved translation is
   reused; otherwise one full-context translation is queued. Text, search,
   download and seeking use the translated track, with original time ranges.
   Changing language cancels only the browser's wait, not an already-paid job.
4. Select **Answer language** independently. Ask an English question with Italian
   output, such as `Why does the first weight matrix have I+1 columns?`.
5. Select up to 120 seconds in the transcript/timeline and ask about that part.
   Click a time citation to seek, and a PDF citation to open the cited document
   and page. Multiple PDFs have distinct document IDs in persisted citations.
6. Ask `Summarize this lecture` without a selection: this uses all original
   transcript chunks, not only the few passages retrieved for a topic question.
   Very large requests may be refused by the configured per-request cost cap.
7. Open **Chapters**, seek by chapter and reload the page. Chats, chapters,
   sources, translation tracks, embedding caches and vectors persist locally.
8. Upload changed sources: RAG activates a new source version; old translation
   tracks are not reused for different text. Uploading only a replacement MP4
   archives its old transcript under `.local/web/archived` before new ASR.

**Load files / drag and drop** remains a browser-only preview. It does not send
files to the server; chat is hidden for a local preview to prevent answering
against a different recording. Use **Upload sources for AI** for integrated use.

## Backend boundaries for the next phase

- Authentication/OTP, student accounts, course enrollment and catalog persistence
  are still demo implementations. The app is intended for local development.
- Whole-course, cross-lecture retrieval is not implemented; chat is lecture-scoped.
- Slide/PDF translation and PDF-layout preservation, dubbed audio/TTS, visual
  slide detection/alignment, diagram understanding and scanned-PDF OCR are not
  implemented. Transcript translation and tutor response language are connected.
- Background ASR/translation jobs currently run in one process; a durable queue,
  cancellation, multi-user isolation and a production deployment remain future work.
- Existing diagrams/formulas depend on extracted PDF text. A citation identifies
  supporting content, not proof that a slide was on screen at that video time.

## Checks performed

- 45 root Python tests, including integrated upload/chat/language/translation-cache/
  summary/chapter/source-version contracts; 12 frontend tests; TypeScript and
  production build passed.
- Existing chatbot tests: 16 discovered, 10 passed and 6 skipped because the
  old optional Poppler CLI is absent. The unified backend uses pypdf and its PDF
  upload/extraction routes are covered by the passing integration tests.
- Browser smoke test: real video and transcript, saved Italian translation,
  live RAG answer in Italian to an English question, follow-up chat, six generated
  chapters, and PDF citation opening page 25.
- Real Whisper job tested through upload/status/transcript HTTP endpoints on an
  eight-second clip; completed with one English segment using `openai-whisper`.
- Live whole-lecture summary HTTP route returned 200 with all five original
  transcript chunks as sources; the saved Italian track returned completed
  without a new translation call.
- The short ASR test and one sample lecture are not a long-recording or load test.
