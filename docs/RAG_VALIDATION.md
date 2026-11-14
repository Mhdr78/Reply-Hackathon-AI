# RAG validation — 14 November 2026

The implementation was tested independently of the teammate's chat/UI code.
No files under `polimi-lectures/` or the downloaded prototype were changed.

- 40 automated tests passed in the project's `.venv`, including real local
  Qdrant persistence, scope/version isolation, source citations, selected word
  times, API contracts, budget limits, embedding caching and long-input pooling.
- A live index was built from the existing English sample transcript (157
  segments, about 15 minutes) and 55 extracted PDF pages: 60 chunks total.
- Embeddings: local `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`
  through FastEmbed, 384 dimensions. The first model download was separate from
  indexing; indexing with weights cached took 4.4 seconds on this machine.
- Reranking and answers: `openai/gpt-6-luna` through OpenRouter, using the real key.

| Sample question | Retrieved expected source in top 5 | Answerability check |
| --- | --- | --- |
| English: why I+1 matrix columns? | Original transcript interval | Answered in English |
| Italian: why I+1 matrix columns? | Original transcript interval | Answered in Italian |
| Activations and derivatives on slides | PDF page 18 | Answered with page citation |
| Italian: feedforward network layers | PDF page 17 | Answered in Italian |
| Photosynthesis, absent from sources | No expected source | Refused for insufficient evidence; no citations |

All four positive source expectations were retrieved; all five answerability
checks passed. Observed end-to-end times were 1.2–5.5 seconds per question.
These five source-specific cases are a smoke test, not a general accuracy
benchmark. Two-to-three-hour recordings, concurrent users, remote Qdrant,
visual-only slide content, and the existing UI's end-to-end chat path were not
validated by this run.

Successful requests reported $0.00876695 in provider cost. Two earlier hosted
embedding requests were rejected by the account's model guardrail; the local
ledger conservatively retains $0.00425204 for those unpriced failures. The total
used-or-reserved amount was $0.01301899, below the $0.10 live-test cap. This is
local RAG accounting, not the account's remaining wallet balance.

Full local results and source metadata are saved in the ignored
`.local/rag/evaluation_sample.json`. To repeat the same checks, see
`docs/evaluation/sample_lecture.json` and the evaluation commands in `RAG.md`.
The UI integration has since been completed; see `APP_INTEGRATION.md` for the
subsequent integrated route tests, browser smoke test and remaining boundaries.
