# Hybrid lecture RAG

This module is independent of the teammate's prototype. No prototype source,
PDF, transcript duplicate, SQLite database, or reviewed-link file is included
in this implementation. It accepts the original transcript format and extracted
PDF-page dictionaries so the prototype can connect later through a stable API.

## Implemented pipeline

1. Validate canonical English/Italian source transcript JSON.
2. Build source-addressable chunks from transcript segments and PDF text.
3. Cache multilingual local embeddings and store dense vectors in Qdrant.
4. For a question, retrieve dense candidates plus BM25 lexical candidates from
   the active version of the selected course/lecture; fuse using RRF.
5. Optionally add a canonical excerpt for the selected video interval/current time.
6. Rerank up to 20 candidates with a budgeted structured-model call.
7. Generate a supported English/Italian answer from at most eight final sources.
8. Validate citations and attach original time ranges or PDF page numbers in code.

The old full-context prototype is not imported or modified. This RAG sends
retrieved evidence rather than the full lecture and PDF deck on every question.

## Install and start

From the repository root:

```bash
python -m venv --system-site-packages .venv
source .venv/bin/activate
python -m pip install -e '.[rag,test]'
python rag.py index --transcript outputs/lecture_001/transcript.json --pdf data/slides.pdf --dry-run
python rag.py index --transcript outputs/lecture_001/transcript.json --pdf data/slides.pdf
python rag.py ask --lecture-id lecture_001 --response-language it 'Perché la matrice ha I+1 colonne?'
python rag.py serve --port 8010
```

Replace `data/slides.pdf` with an existing PDF path. Multiple `--pdf` arguments
are supported. The paths are operator inputs to the CLI, not paths supplied by
the browser API. `--dry-run` extracts/builds chunks without opening a database or
making API calls. Ordinary `index`, `search`, `ask`, and evaluation may consume
OpenRouter credit on cache misses.

Existing `OPENROUTER_API_KEY` in the project `.env` is reused. No key belongs in
the frontend. Configuration defaults are listed in `.env.example`; the real
`.env` does not need to be replaced.

The default backend is **persistent local Qdrant**, with data under
`.local/rag/qdrant`. SQLite under `.local/rag/catalog.sqlite3` stores active source
versions, canonical excerpts, lexical-search chunks, model caches and spending.
Both are application data, ignored by Git. Restarting the process preserves them.
Keep this directory backed up; do not delete it to restart the service.

Local Qdrant supports one owning process. Index with the CLI, close it, then
start the API; subsequent indexing can use `/rag/index` in that same API process.
Do not run multiple Uvicorn workers against the local path.

For a shared Qdrant server, set `QDRANT_URL` and optional `QDRANT_API_KEY`, keep
the catalog/cache directory, and reindex. Saved embeddings are reused where
texts and model match. The server API path is implemented but should be tested
against the deployment; local-Qdrant behavior is covered by integration tests.
Multiple backend processes need a deliberate shared catalog/writer strategy;
this is a single-worker prototype, not a distributed indexing service.

## Models and budget

- Embeddings: `local/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`,
  using FastEmbed/ONNX on CPU. Public weights download once under
  `.local/rag/models`; source text is not sent to the model host. Long inputs
  are split against the loaded tokenizer's actual limit, then all windows are
  pooled and normalized, so the tail is not silently truncated. This pooling
  is an efficiency tradeoff; validate recall on your own lectures.
  [FastEmbed supported models](https://qdrant.github.io/fastembed/examples/Supported_Models/).
  Collection names include a model hash and dimensions come from returned vectors.
- Reranking/answer generation: `openai/gpt-6-luna`, with reasoning disabled for
  the default model to avoid unnecessary reasoning-token work.
- Provider rate ceilings: $0.13/M optional hosted embedding input; $0.10/M chat input and
  $0.50/M chat completion. Unsupported or more expensive routes fail.
- Default local RAG ledger: **$1 total**, **$0.03 estimated per request**. This
  keeps RAG experiments to a small portion of the team's stated $10 credit.
  Settings are `RAG_BUDGET_USD` and `RAG_REQUEST_LIMIT_USD`.

Before a model call, the ledger atomically reserves a conservative UTF-8-byte
input estimate plus the entire completion cap. Reported actual cost replaces
the reservation when available. Ambiguous failures keep the reservation; no
automatic paid retries are made. The ledger persists across process restarts.
The estimate is not a provider billing guarantee. It does not track separate
translation calls, other teammates, other applications, or account-wide spend.
Use the OpenRouter key/account limit for the team's hard total cap.

If OpenRouter returns `404` with `model-ignored-by-guardrail`, the account's model
allowlist blocks the configured model. The account owner must permit that model
in workspace guardrails, or select a model explicitly permitted for the key.
The default local embedding path needs no OpenRouter embedding permission or
embedding credit. Hosted embeddings remain optional: set `RAG_EMBEDDING_MODEL`
to an explicitly permitted OpenRouter model such as
`openai/text-embedding-3-large`, then reindex. A routing failure remains reserved
in the local ledger; that reservation is not proof of an actual provider charge.

```bash
python rag.py status
```

Repeated identical indexing, embeddings, reranking and validated answers are
cached. Caches include source version and relevant model/prompt/language settings.
Editing source text activates a new version only after its vectors are ready;
every query filters the active version. A failed reindex cannot make partial
new vectors visible. Old inactive vectors are pruned after activation; a cleanup
failure leaves inactive data, not mixed-version search results.

## Chunking and retrieval

Chunks are bounded to roughly 2,400 UTF-8 bytes, not a falsely exact word/token
count. Adjacent source fragments are grouped with limited overlap where possible.
Transcript chunk IDs retain original segment IDs and conservative source time
ranges. PDF chunks never cross page boundaries and retain document ID, filename,
title and one-based page number. Dense embeddings provide cross-language semantic
matching; BM25 adds exact terminology/code/math-term matching. RRF combines ranks;
scores are not calibrated probabilities of truth.

Text is extracted from PDFs with `pypdf`. Scanned pages require OCR elsewhere;
empty extracted pages are reported rather than silently treated as understood.
Diagrams, images, visual layout and reliably rendered mathematical notation are
not interpreted by the current text pipeline. A later vision stage can use the
retrieved page images. Content relevance does not prove a slide was visible on
screen at a particular time.

Selected intervals must be at most 120 seconds. Source word timing is used when
available; otherwise the returned range honestly covers the source segments.
For general questions, omit selection/current time. Current time supplies a
rough 40-second context window, not a license to invent missing source evidence.

## Integration contract

See [RAG_INTEGRATION.md](RAG_INTEGRATION.md) for the standalone HTTP and Python
interfaces. The API defaults to loopback port 8010. `/docs` exposes its OpenAPI
schema. CORS defaults cover local UI ports 3000/5173 and can be configured.
The prototype API has no login/access-control system: keep it local until the
application's authentication and course authorization are applied.

## Tests and evaluation

See [RAG_VALIDATION.md](RAG_VALIDATION.md) for the actual local and live sample
test results, measured cost, and limits of that validation.

```bash
python -m unittest discover -s tests -v
python rag.py evaluate --cases docs/evaluation/sample_lecture.json
python rag.py evaluate --cases docs/evaluation/sample_lecture.json --with-answers
```

The unit/integration suite uses real local Qdrant with unpaid model fixtures.
It covers scope isolation, persistence, version replacement, partial-index
failure, multilingual response requests, selected-time citations, unknown
citations, no-evidence output, API contracts, embedding caches and budgets.

The evaluation file is only for the supplied sample lecture/deck, whose page 17
describes feed-forward networks and page 18 lists activation functions. It is
not a universal benchmark. Evaluation without `--with-answers` measures source
recall using hybrid search and may pay query-embedding costs; with the flag it
also uses reranking/generation and checks answerability. Neither metric proves
full semantic faithfulness or teaching quality. Review factual claims, citations,
English/Italian terminology, equations, and negative questions manually as well.
