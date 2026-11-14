# Reply-Hackathon-AI

## Hackathon delivery

The prepared `ml-01` demo video, slides, original/Italian transcripts and chapters
are included in Git, so a fresh clone matches the with-data delivery after setup.

Start with [the delivery guide](delivery/README.md) for reviewer setup, architecture,
recorded interactions, evidence, demo steps and known limits. Pitch slides are separate.

## Question-driven RAG

The separate `lecture_rag` module indexes original transcript JSON and PDF page
text, performs Qdrant semantic + BM25 lexical retrieval, reranks candidates, and
returns English/Italian answers with validated source identifiers and original
timestamps/PDF pages. It does not import or add the teammate's prototype files.

```bash
python -m venv --system-site-packages .venv
source .venv/bin/activate
python -m pip install -e '.[rag,test]'
python rag.py index --transcript outputs/lecture_001/transcript.json --pdf data/slides.pdf
python rag.py serve --port 8010
```

Replace the PDF path with an existing asset; transcript-only indexing is also
supported. Local persistent Qdrant works without a running Docker daemon. Data
and caches live under `.local/rag/`, excluded from Git. A shared Qdrant server
can be selected later through `.env` configuration.

The `polimi-lectures/` UI now uses the unified app API for RAG chat, translation,
Whisper jobs, chapters and media. Start `.venv/bin/python run.py` from the root
and `npm run web` inside `polimi-lectures`. See [manual app test](docs/APP_INTEGRATION.md).

The existing OpenRouter key is reused for reranking and answers with
`openai/gpt-6-luna`. Embeddings run locally with multilingual MiniLM through
FastEmbed; the first run downloads public weights, then inference stays local.
Local RAG limits default to $1 cumulative and $0.03 estimated per
request; this does not replace the team's OpenRouter account spending limit.

- [RAG setup, budget and evaluation](docs/RAG.md)
- [Stable API/Python contract for teammate integration](docs/RAG_INTEGRATION.md)

Lecture transcription component for the team's multimodal RAG system.
It produces original-language text and approximate segment/word timestamps
for the downstream slide alignment, segmentation, retrieval, and tutor agents.

## Current Whisper model

The default model is **local, multilingual Whisper `small`**, loaded with
`whisper.load_model("small")`. It is not the English-only `small.en` model and
does not call the hosted `whisper-1` API. The Python package is pinned to
`openai-whisper==20250625`; that package version is distinct from the model name.
The default can be overridden with `--model`, and the selected model is recorded
in each transcript's `model` field.

## Project layout

```text
Reply-Hackathon-AI/
├── src/lecture_transcription/
│   ├── __init__.py          # Public Python API
│   ├── __main__.py          # python -m entry point
│   ├── core.py              # Language detection and transcription
│   └── cli.py               # CLI arguments and output files
├── src/lecture_translation/ # Full-context OpenRouter translation and source-time mapping
├── src/lecture_rag/         # Indexing, hybrid retrieval, reranking, grounded QA and HTTP API
├── tests/
│   ├── test_language_detection.py
│   └── test_cli.py
├── docs/
│   ├── TRANSCRIPTION_HANDOFF.md
│   ├── MULTILINGUAL_RAG.md
│   ├── COMMIT_GUIDE.md
│   └── LONG_RECORDINGS.md
├── data/                    # Local recordings; ignored except .gitkeep
├── outputs/                 # Generated files; ignored except .gitkeep
├── transcribe.py            # Keeps the original command/import working
├── translate.py             # Translate an existing transcript without rerunning Whisper
├── rag.py                   # Index/search/ask/serve/evaluate commands
├── pyproject.toml           # Package metadata, dependency pin, console command
├── requirements.txt         # Installs this package in editable mode
└── .gitignore
```

## Setup and run

Use a compatible Python 3.10+ environment. This module has been exercised on
macOS with Python 3.13 and the pinned Whisper package. Install from the repo root:

```bash
python -m pip install -r requirements.txt
```

FFmpeg must also be installed. On macOS:

```bash
brew install ffmpeg
ffmpeg -version
```

Put a recording at `data/lecture.mp4`, then run:

```bash
python transcribe.py data/lecture.mp4 --lecture-id lecture_001
```

After package installation, these equivalent entry points are also available:

```bash
python -m lecture_transcription data/lecture.mp4 --lecture-id lecture_001
lecture-transcribe data/lecture.mp4 --lecture-id lecture_001
```

The detector chooses **English or Italian only**, sampling up to three parts of
the recording and skipping near-silence. It assumes one main language per video.
Override it with `--language en` or `--language it` when needed. Whisper preserves
the spoken language; changing a tutor's response language is a separate concern.

The first use of a model may download weights. Later loads reuse the local cache.
No OpenAI API key is required. Device selection uses CUDA when available and
otherwise CPU, including on this Mac. The macOS compatibility setup selects
Numba's `workqueue` before import to avoid the observed duplicate OpenMP failure.
Use separate worker processes for concurrency; details are in the handoff.

## Outputs and Python integration

```text
outputs/lecture_001/transcript.json
outputs/lecture_001/transcript.txt
```

The JSON includes schema version `1.0`, lecture/model/language metadata, full
text, and segments containing IDs, start/end seconds, text, and timed words.
Times refer to the original recording. Generated transcripts and recordings are
not committed to Git. Existing output requires explicit `--overwrite` to replace.

```python
from lecture_transcription import transcribe_lecture

transcript = transcribe_lecture(
    "data/lecture.mp4",
    lecture_id="lecture_001",
)
```

This function returns a dictionary without writing files. Each call loads a
model; a future batch service should manage model reuse and worker lifecycle.
The previous `from transcribe import transcribe_lecture` import still works when
running from the checkout.

## Translate the full transcript

The translation module reads all original segment texts together in one request,
translates the complete lecture, and returns coherent units with original source
IDs. Adjacent source fragments can be merged for natural phrasing. Timestamps
are copied from their source intervals; translated word timestamps are not
invented. The original transcript stays available as a separate language track.

The budget-oriented default is `openai/gpt-6-luna` through OpenRouter. Configure
`OPENROUTER_API_KEY` in the repository-root `.env` file; it is read automatically.
The local file takes precedence over an environment variable; a blank/missing
file value falls back to the environment. No additional SDK or Whisper model is
needed by the translator.

If setting up a fresh checkout, install dependencies and copy the template once:

```bash
python -m pip install -r requirements.txt
cp .env.example .env
```

Fill in the local file:

```dotenv
OPENROUTER_API_KEY=your_openrouter_key_here
```

`.env` is ignored by Git; `.env.example` is the shareable empty template.

Prepare the entire request without spending API credits:

```bash
python translate.py outputs/lecture_001/transcript.json --target-language it --prepare-only
```

After filling in `.env`, execute translation:

```bash
python translate.py outputs/lecture_001/transcript.json --target-language it
```

The JSON and text are saved under `outputs/lecture_001/translations/it/`.
Matching saved translations are reused without another call. Providers must
support the JSON schema and the configured price ceilings. A conservative
per-request estimated-cost guard defaults to $0.10. For the team's total $10
budget, also apply the key/account spending limit in OpenRouter; the local
estimate is not an account-wide spending ledger.

[Full translation contract and UI integration](docs/TRANSLATION.md)

## Team documentation and checks

- [Exact processing and JSON contract](docs/TRANSCRIPTION_HANDOFF.md)
- [English/Italian tutor behavior and token-efficiency decision](docs/MULTILINGUAL_RAG.md)
- [Files to commit and push commands](docs/COMMIT_GUIDE.md)
- [Model selection and processing 2–3 hour lectures](docs/LONG_RECORDINGS.md)

After installation, run:

```bash
python -m unittest discover -s tests -v
```

The detector tests use simulated probabilities. English audio has also been
processed with word timestamps; real Italian lecture accuracy remains to be
evaluated. Whisper segments are transcription units, not final lesson topics.
The separate RAG package now supplies multilingual embeddings, retrieval and
source-grounded tutor answers. Visual slide interpretation, OCR and frontend
wiring remain separate integration work. See the RAG contract above before
connecting the teammate's UI or prototype.
