# Full-context transcript translation through OpenRouter

## Implemented scope

Translate an existing complete English/Italian transcript into the other
language. Produce a full translated TXT and a JSON transcript track that the UI
can display and seek against the original video. This is text translation, not
video dubbing, slide translation, or a tutoring answer.

The demo UI is outside this repository. This package supplies the backend
request, validation, output artifacts, and CLI; it does not add a UI button or
HTTP endpoint to that separate demo.

## Model and the $10 credit budget

Default OpenRouter model: **`openai/gpt-6-luna`**. It is a cost-oriented starting
candidate; English/Italian lecture translation quality has not been established
by the offline tests. Its listed standard rates at implementation time are
$0.10 per million input tokens and $0.50 per million output tokens.
[OpenRouter model listing](https://openrouter.ai/openai/gpt-6-luna)

For illustration, 50,000 input tokens and 50,000 completion tokens cost $0.03 at
those rates, before any other applicable charges. This is an example, not a
measured price for a two- or three-hour class. Duration alone does not establish
text token counts.

The request sets provider price ceilings of $0.10/M input and $0.50/M output,
plus `require_parameters: true`. Routing fails rather than selecting an endpoint
above those rates or lacking the required structured-output parameter support.
[OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)

The CLI estimates text cost conservatively using prompt/schema UTF-8 bytes plus
formatting allowance and the entire requested output-token cap. It refuses a
live request above `--max-estimated-cost`, default $0.10. This estimate is not
the model's actual token count, a billing quote, or an account-wide $10 guarantee.
It excludes model-specific extra charges and changes in provider billing rules.
Set the project's key/account spending limit in OpenRouter to enforce the total
budget across users, retries, and teammates. No real credits were spent while
developing the offline tests.

Completed matching translations are reused. There is no automatic HTTP retry;
a timeout can occur after the provider has begun paid processing. Review request
history before repeating a failed/ambiguous job. An explicit `--overwrite`
regenerates and may incur another charge. A more expensive `--model` remains
blocked by the same rate ceilings rather than silently consuming the budget.

## Why the model receives the whole lecture with source IDs

The input JSON already contains the complete text in ordered source segments.
We send all of those texts in one request, retaining only ID and text per segment.
We do not duplicate the full TXT or send word probabilities and timestamps to the
LLM. It can use lecture-wide context for consistent terminology and references.

The model returns this compact structure:

```json
{
  "units": [
    {
      "source_segment_ids": ["lecture_001_00000", "lecture_001_00001"],
      "text": "Una traduzione coerente dei due frammenti originali."
    }
  ]
}
```

This illustrative response is only complete if those IDs cover the entire
example source. Every source ID must appear exactly once, in original order,
across all returned units. The validator rejects missing, duplicate, unknown,
or reordered IDs, empty translations of spoken content, invalid source timing,
malformed JSON, refusals, and incomplete/truncated responses. Structural validity
does not establish semantic accuracy; bilingual review is still needed.

Adjacent original fragments can be merged into a natural sentence/paragraph
unit, up to 12 source IDs per unit. The count of translation rows can differ
from the source. This supports fluent translation while retaining source links.
It does not promise exactly one grammatical sentence per row: source timing
boundaries and incomplete spoken sentences can require broader units.

Translating free TXT first and guessing time alignment afterward would lose the
source mapping. Here translation and alignment references are produced together;
the final full TXT is assembled from the validated translated units.

## Run and output locations

Put `OPENROUTER_API_KEY` in the repository-root `.env` file, then run:

```bash
python translate.py outputs/lecture_001/transcript.json --target-language it
```

For an Italian source, use `--target-language en`. Selecting the source language
again is rejected; the UI should show the original track without an API call.
The module reads `.env` automatically with `python-dotenv`, without expanding
variables or exporting its values into the process environment. A nonempty
local file value takes precedence; an environment variable is the fallback for
deployed services. When running from this source checkout, the file is located
relative to the package, so it still works when launched from another directory.
Installed wheels use `.env` in the caller's current directory.

Use `.env.example` as the blank template on a fresh checkout. The real `.env`
is ignored by Git and is not sent in prepared request JSON. Keep the key in the
backend, outside Git and the browser UI. Editing `.env` takes effect on the next
live call; no shell export is required.

For a free preparation check, without a key or network call:

```bash
python translate.py outputs/lecture_001/transcript.json --target-language it --prepare-only
```

This saves only `translation_request.json` and prints the estimate. It does not
create a translated transcript or establish translation quality.

After installation, `lecture-translate` and `python -m lecture_translation` are
equivalent entry points. The root `translate.py` works directly from the checkout.

```text
outputs/lecture_001/
├── transcript.json                  # Original Whisper artifact
├── transcript.txt                   # Original readable transcript
└── translations/it/
    ├── transcript.json              # Translated track
    ├── transcript.txt               # Full translation, paragraphs separated by blank lines
    └── translation_request.json     # Only when --prepare-only was used
```

`--output-dir` selects the exact translation directory, unlike the transcription
CLI's base-directory argument. It cannot be the original transcript directory.
Outputs under the standard `outputs/` tree are already ignored by Git.

## Translated JSON shape and alignment

The translated artifact retains the standard `lecture_id`, `source_video`,
`text`, `language`, `timestamp_unit`, and `segments` shape. It adds:

| Field | Meaning |
| --- | --- |
| `schema_version` | `"1.0"`, with the translated-artifact extension described here |
| `artifact_type` | `"translated_transcript"`; distinguish it from raw ASR |
| `engine` | `"openrouter"`; the original ASR engine is in translation metadata |
| `model` | Model reported by OpenRouter, or the requested ID if not reported |
| `language` | Target language `en` or `it` |
| `source_language` | Original transcript language |
| `alignment_level` | `"source_segment_range"` |
| `translation` | Source SHA-256, original ASR model/engine, prompt version, requested model, response ID, usage |

Each translated segment contains:

```json
{
  "segment_id": "lecture_001_it_00000",
  "source_segment_ids": ["lecture_001_00000", "lecture_001_00001"],
  "start": 12.4,
  "end": 24.8,
  "text": "Il testo tradotto associato a questo intervallo.",
  "words": []
}
```

The example times and text are illustrative. Application code sets `start` to
the earliest referenced source start and `end` to the latest referenced source
end. The model never generates or adjusts timestamps. The final TXT is the
concatenation of unit texts; the original transcript is not overwritten.

`words` is deliberately empty. A translated word can move or correspond to
multiple source words, so source-language word timestamps/probabilities cannot
be reused as target-language word alignment. The UI should follow/highlight
translated units and seek to their source start. Word-level translated karaoke
timing or dubbing requires a separate alignment/audio pipeline.

## Integration functions and UI behavior

```python
from lecture_translation import translate_transcript

translated = translate_transcript(
    source_transcript,
    target_language="it",
    max_estimated_cost=0.10,
)
```

This function applies source validation, request construction, the estimated
cost check and price ceilings, then validates the returned translation. It
returns a dictionary without saving files. The CLI adds saved-output reuse and
persistence. A backend integrating the function must implement its own storage,
cache, account budget policy, and worker lifecycle. Low-level helpers
`build_request` and `assemble_translation` are also available; do not bypass the
service's budget checks when wiring a live UI.

For the separate UI: keep original and translated tracks, offer English/Italian
selection, show job progress while translation runs, load a completed artifact,
and keep original-time click navigation. The caller should verify the requested
target/source version before loading an artifact. Translation is a long-running
operation and should be owned by a backend worker rather than a browser request
that exposes the API key.

The current CLI is synchronous and non-streaming. It has no web server, queue,
progress events, automatic resume, or distributed writer lock. Use one writer
per artifact directory. It stages both files and publishes JSON last, but this
is not a transactional two-file database update for concurrent readers.

## Long recordings and verification

Large context does not mean unlimited output. The default output cap is 65,536
tokens. If a long lecture is truncated, it is rejected rather than silently
saved as complete. Review usage and the budget before deliberately increasing
`--max-output-tokens` or designing a context-preserving multi-request workflow.
No automatic fallback to isolated sentence translation is implemented.

The JSON-schema route is based on
[OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs).
Different providers can differ in enforcement; local coverage validation remains
mandatory even when strict schema is requested.

Tests mock API output and verify source coverage, timing, budget refusal,
cache reuse, and failure behavior. They do not call a paid model or demonstrate
translation quality. Test a representative English and Italian excerpt with the
real provider before translating the entire library.
