# Polimi Lectures — Coding Prototype Delivery

**Team repository:** https://github.com/Mhdr78/Reply-Hackathon-AI
**Delivery date:** 14 November 2026
**Code baseline:** `de583cb` — files integration
**Entry point:** `run.py` + `polimi-lectures/apps/web`
**Scope:** Working local coding prototype; pitch slides are delivered separately.

The assistant turns a lecture recording and related documents into searchable,
time-linked learning material. Students can read an English or Italian transcript,
request a translated transcript, ask grounded questions in either language, and
open the supporting video moment or PDF page. Whole-lecture summaries and chapters
use separate full-transcript paths so an overview is not mistaken for a top-k extract.

## Reviewer reading order

| File | Purpose |
| --- | --- |
| [PROJECT_BRIEF.md](PROJECT_BRIEF.md) | Problem, target users, idea, realistic use scenario and success measures |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Inputs, knowledge, tools, decisions, outputs and custom implementation |
| [EXAMPLE_INTERACTIONS.md](EXAMPLE_INTERACTIONS.md) | Recorded examples, including an explicit refusal for missing evidence |
| [VALIDATION.md](VALIDATION.md) | Measured results and boundaries of the testing |
| [DEMO_RUNBOOK.md](DEMO_RUNBOOK.md) | A short live-demo sequence and honest fallback |
| [PITCH_SCRIPT.md](PITCH_SCRIPT.md) | A draft 60-second spoken pitch; no presentation file |
| [CHECKLIST.md](CHECKLIST.md) | Mapping to the hackathon delivery checklist |

## Setup from the repository root

Tested on macOS with **Python 3.13.9**, **Node 24.12.0**, npm 11.6.2 and FFmpeg.
The package declares Python >=3.10; other configurations have not been validated
by this delivery. Install FFmpeg separately and ensure `ffmpeg -version` succeeds.
On macOS: `brew install ffmpeg`.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[rag,test]'
npm ci --prefix polimi-lectures/apps/web
```

Create `.env` from the empty template **only if you do not already have one**:

```bash
[ -f .env ] || cp .env.example .env
```

Fill `OPENROUTER_API_KEY` in that local file. The key must permit the configured
chat model. It is never placed in the frontend. The first Whisper/FastEmbed run
downloads public weights; later runs reuse them. There is no Docker requirement.

Start these in separate terminals from the repository root:

```bash
.venv/bin/python run.py
```

```bash
cd polimi-lectures
npm run web
```

Open **http://127.0.0.1:5173/lectures/ml-01**. Backend health:
http://127.0.0.1:8787/api/health. If a port is already occupied by an earlier app
instance, stop that instance before starting another. The separate standalone
`rag.py serve` process must not share the same local Qdrant directory concurrently.

**Demo login, not university authentication:** person code `12345678`, password
`demo1234`, OTP `123456`. The course list is demo data.

Use **Upload sources for AI** to provide an MP4 recording, original transcript
JSON and/or PDFs. The included [sample transcript](sample_data/transcript.json)
is a hand-authored fixture for a transcript-only test, not a recording or an ASR
quality result. Both the Git repository and with-data archive include the real sample recording, original transcript,
slide PDF, validated Italian track and six cached chapters as `ml-01`. After
setup, open that lecture directly; no upload or new transcription is required.
See [DEMO_DATA.md](DEMO_DATA.md). To transcribe another recording, upload its MP4.

**Load files** is a browser-only preview and does not upload AI sources. Transcript
language and answer language are separate controls. Changing transcript language
may start a full-lecture paid translation; a matching saved result is reused.

## Models, libraries and custom logic

| Role | Implementation |
| --- | --- |
| ASR | Local multilingual Whisper `small`; `openai-whisper==20250625`; FFmpeg; constrained English/Italian detection |
| Semantic embeddings | Local `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`, FastEmbed/ONNX, 384 dimensions |
| Retrieval storage | Persistent local Qdrant; SQLite source catalog, caches and spending ledger |
| Rerank, tutor, summary, chapters | `openai/gpt-6-luna` through OpenRouter |
| Transcript translation | Same OpenRouter model; complete ordered transcript translated into units with original source IDs |
| API | Python, FastAPI, Uvicorn, python-multipart, pypdf, python-dotenv |
| Frontend | React, TypeScript, Vite, Tailwind CSS, React Router, Lucide |
| Validation | Python unittest, FastAPI TestClient/httpx, Vitest, TypeScript and Vite build |

Dependency ranges are in `pyproject.toml`; the frontend lockfile is included.
Custom logic includes byte-bounded source chunks, non-truncating local embedding
window pooling, BM25 + semantic rank fusion, source-version filtering, structured
reranking, server-attached citations, complete-coverage translation validation,
background job deduplication, caches and cost reservations. See the architecture.

## Cost and data handling

Embeddings and Whisper run locally with no API inference charge. RAG defaults to
$1 cumulative local accounting and $0.03 conservative estimated per model request.
Translation has a separate $0.10 conservative estimated per-request cap. These
are not a hard account-wide $10 cap or an account balance check. Configure the
OpenRouter key/account spending limit for the team's shared total budget.

Topic questions send retrieved evidence and bounded conversation context to
OpenRouter. Translation, overview and chapter requests can send the full transcript
or transcript-derived text. Recordings/PDFs and caches remain local; source text
is not sent to the embedding model host. The Git repository and with-data archive include only the prepared `ml-01` demo sources, translated
track and chapter database. `.env`, personal chat history, spending ledgers,
vector caches, downloaded weights and other local recordings are excluded.
Playback, the saved translation and cached chapters do not require a new model
call; new AI answers require your own permitted OpenRouter key.

## Verify

```bash
.venv/bin/python -m unittest discover -s tests -v
npm test --prefix polimi-lectures/apps/web
npm run typecheck --prefix polimi-lectures/apps/web
npm run build --prefix polimi-lectures/apps/web
```

The integrated app was checked with 45 Python tests and 12 frontend tests, plus
live/browser checks described in [VALIDATION.md](VALIDATION.md). Authentication,
course persistence, cross-lecture retrieval, OCR/vision, PDF translation, dubbing
and a durable job queue are outside the implemented scope.
