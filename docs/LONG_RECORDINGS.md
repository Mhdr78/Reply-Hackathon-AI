# Whisper model choice for 2–3 hour lectures

## Current implementation and model

The current default is **multilingual Whisper `small`** (244 million parameters),
from the locally installed `openai-whisper==20250625` package. It was chosen for
initial integration, not established as the most accurate production option.
The model name is already configurable with `--model` and `model_name=`.

A longer recording does not inherently require a larger model. Duration chiefly
increases processing time and memory/operational demands. Audio quality,
terminology, accents, and the quality target determine whether a larger model's
accuracy benefit is worth its compute cost.

## Candidate comparison

The parameter counts and approximate GPU memory figures below come from the
model table distributed with the pinned Whisper package. They are upstream
reference figures, not measured Mac RAM requirements or promises of runtime.

| Model | Parameters | Approximate upstream GPU VRAM figure | Candidate use |
| --- | ---: | ---: | --- |
| `small` | 244 M | ~2 GB | Development and baseline measurements |
| `medium` | 769 M | ~5 GB | Compare accuracy with the current baseline; test CPU runtime carefully |
| `turbo` (`large-v3-turbo`) | 809 M | ~6 GB | First GPU-backed throughput/quality candidate for long transcription jobs |
| `large-v3` | 1,550 M | ~10 GB for large family | Accuracy-oriented comparison when runtime and memory are acceptable |

Upstream describes `turbo` as an optimized `large-v3` transcription model.
Published relative speed figures use an A100 and English audio; do not transfer
those speed multipliers to this Mac or assume the same quality on Italian classes.
The package here selects CPU on the current Mac; it does not enable MPS.

The prototype's default remains `small` until the team evaluates candidates.
No new model download or multi-hour job is needed merely to organize the repo.

To select a larger model explicitly:

```bash
python transcribe.py data/lecture.mp4 --lecture-id lecture_medium --model medium
```

For a GPU-backed candidate, on a compatible environment:

```bash
python transcribe.py data/lecture.mp4 --lecture-id lecture_turbo --model turbo --device cuda
```

For the accuracy-oriented baseline:

```bash
python transcribe.py data/lecture.mp4 --lecture-id lecture_large_v3 --model large-v3 --device cuda
```

Do not use `.en` variants for automatic English/Italian selection. Different
model outputs need separate artifact versions; new segment IDs/order/timing may
change, so do not overwrite a transcript already referenced by an index without
rebuilding or versioning its derivatives.

## Measure before processing entire classes

Use a 10-minute sample containing real speech, terminology, accents, and any
noise. Evaluate both English and Italian recordings. Compare text errors,
technical names, numbers, negations, timestamp utility, peak memory, and elapsed
time. Prefer the least costly candidate that meets the team's quality target.

```text
real_time_factor = processing_seconds / audio_seconds
rough_full_job_time = sample_real_time_factor * full_audio_seconds
```

For illustration, a 10-minute sample that takes 6 minutes has RTF 0.6. Extrapolated
to 3 hours, that suggests 108 minutes, not a measured guarantee. Model loading,
thermal throttling, noisy sections, silence, and decoding retries can change it.

## Current behavior on long files

Whisper uses internal sliding decoding windows, but this wrapper decodes and
holds the entire recording's waveform in memory. Mono float32 at 16 kHz alone
uses about 461 MB for 2 hours or 691 MB for 3 hours (decimal MB), before model
weights, decoder buffers, temporary arrays, and alignment computation.

The job runs synchronously. It writes the final JSON and text at the end; it has
no resumable application checkpoints, cancellation interface, job queue, or
automatic retry/resume after a crash. Word timestamps add alignment work. A
successful short sample does not prove that a multi-hour job will finish within
the deployment's memory and time limits.

## Production work for long jobs: proposed, not implemented

1. Put transcription in a background worker and track progress/job state. Reuse
   a loaded model across sequential jobs when the service owns that lifecycle.
2. If memory limits or resumability require external chunks, use manageable
   audio intervals, for example 5–10 minutes, with a deliberate boundary policy.
   These processing chunks are distinct from educational RAG topic chunks.
3. Preserve each chunk's offset from the original recording. Add that offset to
   every segment and word timestamp before assembling the final transcript.
4. If using overlap for boundary speech, deduplicate matching speech at the
   overlap using timing and text; concatenation alone repeats content.
5. Persist per-chunk results and configuration for resume, then assign final
   transcript/segment versions after successful assembly.
6. Keep language selection a lecture-level English/Italian decision for
   single-language classes. Do not independently redetect silent chunk openings
   and accidentally switch the lecture's language.
7. Keep unedited original media and raw transcript artifacts for provenance.

Implement and test these capabilities explicitly before describing the module
as a resilient multi-hour processing service. A GPU-backed `turbo`/`large-v3`
worker is a candidate deployment, not something already configured by this repo.

## Local ASR compute versus tutoring LLM tokens

Increasing the local Whisper model does not directly increase a hosted tutoring
LLM's billed text tokens. It changes ASR compute/memory/runtime and may change
the recognized text. LLM usage depends on what retrieved evidence and generated
answers the downstream tutor actually processes. Keep only relevant passages
in its prompt, regardless of the lecture's total duration.
