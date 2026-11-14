# Transcription module: implementation and integration handoff

This document describes the current implementation in `src/lecture_transcription/core.py`
(transcription), `src/lecture_transcription/cli.py` (CLI), and the
contract downstream agents should use. It is written in English for the team
and coding agents. Examples marked **proposed** describe downstream work, not
features already implemented by this module.

## 1. Responsibility and pipeline boundary

```text
Original lecture video/audio
    -> FFmpeg audio decoding
    -> English/Italian language selection
    -> local Whisper transcription and word alignment
    -> transcript.json + transcript.txt
    -> topic segmentation / slide alignment / retrieval / tutoring
```

This module produces spoken text and approximate timestamps. The other agents
implement topic segmentation, frame analysis, slide extraction and alignment,
embeddings, retrieval, summaries, questions, and teaching.

The transcript does not describe everything visible in the video. A formula,
diagram, code listing, or slide text may be absent from the transcript if the
lecturer does not read it aloud. Combine transcript evidence with the visual
and slide pipelines when answering questions.

## 2. Files and their roles

| File/directory | Current role |
| --- | --- |
| `src/lecture_transcription/core.py` | Language selection and reusable transcription function |
| `src/lecture_transcription/cli.py` | CLI arguments and output serialization |
| `src/lecture_transcription/__init__.py` | Public package exports |
| `src/lecture_transcription/__main__.py` | Module entry point |
| `transcribe.py` | Compatibility wrapper for the original command/import |
| `pyproject.toml` | Package configuration, dependency pin, console entry point |
| `requirements.txt` | Installs this project in editable mode; the Whisper pin lives in pyproject.toml |
| `tests/test_language_detection.py` | Five deterministic language-selection regression tests using simulated scores |
| `tests/test_cli.py` | Regression check that both entry points report a missing recording cleanly |
| `README.md` | Installation and quick-start instructions |
| `data/` | Local input recordings; its contents are ignored by Git except `.gitkeep` |
| `outputs/` | Local generated transcripts; its contents are ignored by Git except `.gitkeep` |
| `.gitignore` | Also excludes Python cache files, `.venv/`, `.env`, and `.DS_Store` |

FFmpeg is a separate system dependency, not installed by `requirements.txt`.
The module uses local open-source Whisper, not the hosted transcription API.
No OpenAI API key is required. A model's first load may download weights;
subsequent loads use the local Whisper cache.

## Model used and related design decisions

The current default is **multilingual Whisper `small`**, loaded locally with
`whisper.load_model("small")`. The existing English lecture output records
`"model": "small"`. This is different from `small.en` and from the hosted
`whisper-1` API. `openai-whisper==20250625` identifies the installed software
release, not a new model or fine-tuned checkpoint. `--model` remains configurable.

See [long-recording model selection](LONG_RECORDINGS.md) before processing
2–3 hour classes, and [multilingual RAG design](MULTILINGUAL_RAG.md) for generating
Italian explanations from English evidence or the reverse. Transcript `language`
is the source language. The proposed tutor `response_language` is a separate
request preference and is not a parameter of `transcribe_lecture`.

## 3. Run the command

Run these commands from the repository root, using the Python environment with
the requirements installed:

```bash
python -m pip install -r requirements.txt
python transcribe.py data/lecture.mp4 --lecture-id lecture_001
```

On macOS, install/check FFmpeg with:

```bash
brew install ffmpeg
ffmpeg -version
```

### CLI arguments

| Argument | Default | Behavior |
| --- | --- | --- |
| `video` | Required | Existing local video/audio path readable by FFmpeg; quote paths containing spaces |
| `--lecture-id` | Sanitized input filename stem | Shared identifier; only ASCII letters, digits, `_`, and `-` are accepted |
| `--language` | `auto` | Choose automatically between `en` and `it`, or explicitly force either code |
| `--model` | `small` | A model name returned by `whisper.available_models()` |
| `--device` | `auto` | Select CUDA if available, otherwise CPU; explicit choices are `cpu` and `cuda` |
| `--output-dir` | `outputs` | Base directory; the CLI appends the lecture ID |
| `--overwrite` | Off | Allow replacing an existing JSON or text output for that lecture |

`--device auto` uses CPU on this Mac. This implementation does not select MPS.
Automatic English/Italian detection requires a multilingual model. An `.en`
model is accepted only with explicit `--language en`.

Use an explicit lecture ID from your application's lecture record. Filename
stems can collide and should not be the identity scheme for a multi-user system.

Example with a different output base:

```bash
python transcribe.py data/lecture.mp4 --lecture-id lecture_001 --output-dir artifacts
```

This writes to `artifacts/lecture_001/`, not directly into `artifacts/`.

## 4. Exactly what happens during processing

1. Validate the input path, FFmpeg availability, lecture ID, device, model name,
   and optional language override.
2. Load the requested Whisper model. A new model is loaded on each function call.
3. Decode the entire recording once with `whisper.load_audio`: mono, 16 kHz,
   float32 waveform. The waveform retains the recording's timeline.
4. If language is automatic, run the restricted detector described below.
5. Pass that same complete waveform to `model.transcribe`, with
   `task="transcribe"`, the selected language, `word_timestamps=True`, and FP16
   enabled only on CUDA. This preserves the spoken language rather than
   translating Italian into English.
6. Build the version `1.0` output dictionary, adding lecture and segment IDs.
7. The CLI writes UTF-8 JSON and plain text. The Python function returns the
   dictionary without writing files.

This is synchronous, offline processing of a completed recording. The full
waveform is held in memory; there is no application-level streaming or external
audio chunking in the current code. Whisper handles its internal decoding windows.

### Restricted automatic language selection

The only candidates are `en` and `it`. For an audio array of length `N`, the
detector uses:

```python
window = 30 * 16000
max_start = max(0, N - window)
starts = sorted({0, min(60 * 16000, max_start), max_start // 2})
```

For each unique start, it takes up to 30 seconds. Short samples are padded for
Whisper's detector. A sample is skipped if it is empty or its RMS amplitude is
below `0.0001`. This is a near-silence filter, not speech activity detection;
music may still be processed.

The detector asks Whisper for probabilities over its languages, sums only the
English and Italian probabilities across usable samples, and selects the larger
sum. Equal sums select English. Other languages cannot be returned. No language
confidence score or per-window scores are included in the JSON.

This assumes one main language per recording and that the recording is English
or Italian. It is not a supported-language validator: a recording in a third
language can still be forced into one of these two choices. It does not detect
language changes inside the lecture. If all selected samples are near-silent,
automatic detection raises an error. An explicit language bypasses detection.

## 5. Output contract: `transcript.json`

Default output paths:

```text
outputs/<lecture_id>/transcript.json
outputs/<lecture_id>/transcript.txt
```

### Top-level fields

| Field | JSON type | Meaning |
| --- | --- | --- |
| `schema_version` | string | Currently `"1.0"`; consumers should validate supported versions |
| `lecture_id` | string | Shared identifier provided by the application or CLI |
| `source_video` | string | Input basename only; not a resolvable URL or absolute path |
| `engine` | string | `"openai-whisper"` |
| `model` | string | Requested model name, normally `"small"` |
| `language` | string | Selected language code: `"en"` or `"it"` |
| `timestamp_unit` | string | Always `"seconds"` |
| `text` | string | Full transcript, with outer whitespace stripped |
| `segments` | array of objects | Ordered transcription units from Whisper |

### Segment fields

| Field | JSON type | Meaning |
| --- | --- | --- |
| `segment_id` | string | `<lecture_id>_<zero-based index padded to at least 5 digits>` |
| `start` | number | Approximate segment start in seconds from the original recording's beginning |
| `end` | number | Approximate segment end on the same timeline |
| `text` | string | Segment text, with outer whitespace stripped |
| `words` | array of objects | Word-level alignment entries; consumers must tolerate an empty array |

### Word fields

| Field | JSON type | Meaning |
| --- | --- | --- |
| `word` | string | Whisper word text; it may contain leading whitespace and attached punctuation |
| `start` | number | Approximate word start on the original recording timeline |
| `end` | number | Approximate word end on the original recording timeline |
| `probability` | number | Whisper's word score, usually in `[0, 1]`; not a calibrated correctness guarantee |

Floating-point timestamps are serialized without rounding. For example,
`0.8599999999999997` is possible. Round for display only; keep numeric timestamps
when aligning sources or creating retrieval records. Do not treat gaps, tiny
rounding differences, or zero-duration word estimates as slide boundaries.

### Complete illustrative JSON

The content and scores below are fabricated to illustrate the exact structure;
they are not an excerpt from the user's recording.

```json
{
  "schema_version": "1.0",
  "lecture_id": "lecture_001",
  "source_video": "lecture.mp4",
  "engine": "openai-whisper",
  "model": "small",
  "language": "en",
  "timestamp_unit": "seconds",
  "text": "Gradient descent reduces loss.",
  "segments": [
    {
      "segment_id": "lecture_001_00000",
      "start": 0.5,
      "end": 2.8,
      "text": "Gradient descent reduces loss.",
      "words": [
        {"word": " Gradient", "start": 0.5, "end": 1.0, "probability": 0.96},
        {"word": " descent", "start": 1.0, "end": 1.5, "probability": 0.98},
        {"word": " reduces", "start": 1.5, "end": 2.1, "probability": 0.95},
        {"word": " loss.", "start": 2.1, "end": 2.8, "probability": 0.97}
      ]
    }
  ]
}
```

`transcript.txt` contains the full `text` plus a trailing newline. It contains
no timestamps and is intended for reading. Downstream automation should consume
the JSON.

There are currently no speaker labels, topic titles, embeddings, slide IDs,
frame references, media URLs, video duration, job IDs, creation timestamps,
aggregate confidence scores, SRT files, or VTT files in this output. The end of
the last spoken segment must not be used as the recording's duration.

## 6. Use from another Python component

```python
from lecture_transcription import transcribe_lecture

transcript = transcribe_lecture(
    video_path="data/lecture.mp4",
    lecture_id="lecture_001",
    model_name="small",
    language=None,  # None or "auto": choose between English and Italian.
    device="auto",
)

for segment in transcript["segments"]:
    print(segment["segment_id"], segment["start"], segment["end"], segment["text"])
```

The returned value is a dictionary. This function does not save anything.
Callers needing persistence must serialize it themselves or invoke the CLI.

For a worker that consumes CLI output, launch the process without a shell,
wait for success, then read the expected JSON. For example, when launched from
the repository root:

```python
import json
import subprocess
import sys
from pathlib import Path

project_root = Path.cwd()
lecture_id = "lecture_001"
output_base = project_root / "outputs"
subprocess.run(
    [
        sys.executable,
        str(project_root / "transcribe.py"),
        str(project_root / "data" / "lecture.mp4"),
        "--lecture-id", lecture_id,
        "--output-dir", str(output_base),
    ],
    cwd=project_root,
    check=True,
)
transcript_path = output_base / lecture_id / "transcript.json"
transcript = json.loads(transcript_path.read_text(encoding="utf-8"))
```

Use application-controlled paths and a validated lecture ID. Keep the original
recording in the asset store and associate its real location with `lecture_id`;
`source_video` alone cannot locate it.

## 7. Instructions for downstream agents

### Topic segmentation agent

Whisper segments are transcription units, not completed educational topics.
Group them using their content and any available slide/frame evidence.

For every derived topic chunk, preserve `lecture_id`, the source segment IDs,
original start/end seconds, and the source transcript version. A reasonable
chunk interval is the earliest source start through the latest source end.
Keep the original transcript unchanged and store derived topics separately.

To select entries overlapping an interval `[start_s, end_s)`:

```python
selected = [
    segment for segment in transcript["segments"]
    if segment["start"] < end_s and segment["end"] > start_s
]
```

If the requested interval cuts through a segment, use its word timestamps for
a narrower selection, or include the whole segment as explicitly broader
context. Missing word alignment should fall back to segment-level selection.

### Slide and video alignment agents

Use the same original recording timeline. A timestamp of `125.4` means 125.4
seconds into the supplied recording, not 125.4 seconds into a derived chunk.
Seeking to that time uses the original video's playback timeline.

Map transcript intervals to slide visibility intervals and relevant frames.
That mapping is separate downstream data; a slide PDF alone does not establish
when each slide appeared in the recording. Do not assume one Whisper segment
equals one slide. If you create an edited or trimmed video, explicitly maintain
an offset/mapping back to the original timeline.

### Retrieval/indexing agent

Embed semantically useful topic chunks and/or slide content, with source
metadata. Do not use a single full-lecture `text` as the only retrieval unit.

**Proposed downstream record**, not output generated by this module:

```json
{
  "chunk_id": "lecture_001_topic_003",
  "lecture_id": "lecture_001",
  "source_transcript_version": "an immutable application version or file hash",
  "source_segment_ids": ["lecture_001_00020", "lecture_001_00021"],
  "start": 120.4,
  "end": 151.2,
  "text": "Topic text assembled from the referenced transcript entries.",
  "slide_ids": ["slide_007"]
}
```

Segment IDs are stable within one saved transcript, not across retranscription.
Another model or settings can change segmentation and reuse an ID for different
text. Store an immutable transcript version or SHA-256 hash in the downstream
index. Rebuild dependent chunks when replacing a transcript. Avoid concurrent
writers or different lecture assets sharing the same lecture ID/output folder.

### Tutor, summarization, and question-generation agents

Use retrieved source text together with relevant slide and frame evidence.
Keep source attribution so answers can cite the lecture and seekable time range.
Treat a transcript as fallible evidence, especially for names, technical terms,
numbers, negations, and equations. A high word probability does not prove the
claim itself or guarantee the transcription is correct.

Distinguish spoken evidence, slide evidence, and generated explanation. If
correcting transcript text, preserve the raw output and record the correction
separately so existing timestamps and source references remain traceable.

## 8. Errors, completion, and worker behavior

The CLI normally returns exit code `0` on success. It reports handled input,
decoding, model, or write errors with exit code `1`. Argument validation and
existing-output protection use argparse's exit code `2`. Other unexpected
failures may terminate the process differently; workers should treat any
nonzero exit status as a failure and retain the diagnostic output.

If either output file already exists, rerunning the same lecture ID is refused
unless `--overwrite` is supplied. Regeneration example:

```bash
python transcribe.py data/lecture.mp4 --lecture-id lecture_001 --overwrite
```

Writes are sequential (JSON, then text), not an atomic two-file transaction.
There is no ready marker or filesystem lock. Do not infer job completion merely
from a file appearing: wait for successful process completion and parse the
JSON. A write failure can leave partial/stale output that requires review
before retrying. Keep application job state outside this module.

The macOS compatibility initialization defaults `NUMBA_THREADING_LAYER` to
`workqueue` before importing Whisper. It respects an explicitly set environment
value. This avoids the observed Conda/PyTorch duplicate OpenMP failure without
setting `KMP_DUPLICATE_LIB_OK`. Import this module before other code initializes
Numba; restart already-initialized notebook/service processes when necessary.

The current module is intended for sequential use. For concurrent service
requests, use appropriately managed worker processes or review the threading
backend; Numba's `workqueue` does not support concurrent calls from multiple
Python threads. Loading a model per request is expensive. Reusing a loaded
model in a service is future integration work, not part of the present function.

## 9. Verification and known limits

Run the existing regression checks:

```bash
python -m unittest discover -s tests -v
```

These tests check English/Italian selection even when an unsupported language
scores higher, multiple-window selection, skipping a silent intro, and rejecting
near-silent automatic detection. They mock language probabilities; passing them
does not demonstrate real Italian recognition accuracy.

An English excerpt was processed end to end with word timestamps, and restricted
language detection selected English on the original lecture. A full-length
English transcript is also present in the local output directory. Its existence
does not establish word-level accuracy. Real Italian lecture accuracy and mixed
language behavior have not been evaluated here.

Evaluate representative recordings before judging quality. Speaker diarization,
language switching, external audio chunk stitching, topic boundaries, and
slide/frame alignment remain outside this module's implemented scope.

## 10. Integration checklist

- Use the same lecture ID across the original recording, slides, transcript,
  topics, index records, and citations.
- Consume `transcript.json` version `1.0` and preserve original time coordinates.
- Keep source segment IDs together with an immutable transcript version/hash.
- Store topic chunks and slide alignment as derived data.
- Mark jobs complete only after successful execution and valid output parsing.
- Handle empty segment/word arrays and nonzero process exits.
- Keep source assets and generated transcripts in the agreed shared storage;
  they are not distributed through Git by the current `.gitignore`.
- Describe future API/service features as new implementation work; they are not
  already provided by `transcribe.py`.
