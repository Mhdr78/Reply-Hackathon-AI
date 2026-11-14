# Reply-Hackathon-AI

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
The tutoring LLM, multilingual embeddings, translation cache, slide processing,
and user interface are downstream work, not implemented in this package.
