# Validation and limitations

The results below were observed on 14 November 2026. They describe a local
prototype on one development machine, not a production benchmark.

## Automated checks

| Check | Observed result |
| --- | --- |
| Root Python suite | 45 passed |
| Frontend Vitest | 12 passed across 4 files |
| TypeScript checking | Passed |
| Vite production build | Passed |
| Original chatbot suite | 10 passed; 6 skipped because its optional Poppler `pdftotext` CLI was absent |
| Integrated PDF routes | Passed using pypdf; they do not require the legacy Poppler CLI |

Tests cover scoped retrieval, source-version replacement, persistence, partial
index failure, source-time citations, invalid citation rejection, absent evidence,
cache reuse, local embedding full-text pooling, budget reservations, upload,
translation cache invalidation, original/translated artifact separation, summary,
chapters and source replacement.

## Recorded live sample

Input: an English lecture of about 15 minutes, 157 transcript segments and 55
PDF pages, producing 60 chunks. Local embeddings used multilingual MiniLM,
384 dimensions; reranking/answers used OpenRouter GPT-6 Luna.

| Test | Result |
| --- | --- |
| English question about I+1 weight-matrix columns | Expected transcript evidence retrieved; answered |
| Italian question about the same concept | Expected transcript evidence retrieved; answered in Italian |
| Slide activation functions and derivatives | PDF page 18 retrieved and cited |
| Italian feedforward-layer question | PDF page 17 retrieved and cited |
| Photosynthesis question outside the material | `insufficient_evidence`; no citations |

All four positive source expectations were retrieved in the top 5; all five
answerability checks passed. Recorded question times were **1.2–5.5 seconds**.
Indexing took **4.4 seconds with model weights already cached**. The first model
download is separate and should be done before a live demo.

Successful requests in this specific five-case run reported **$0.00876695**.
Two failed hosted-embedding probes were retained as **$0.00425204 reserved** in
the local ledger, so used-or-reserved was **$0.01301899**. Reserved estimates are
not evidence of actual provider charges. This measured cost does not include
all later UI checks, translation requests, teammates or the wallet balance.

## Integrated live checks

- Original recording played, with real transcript and six generated chapters.
- The existing validated Italian translation appeared through the transcript
  selector without a new translation API call.
- An English question returned an Italian RAG answer; a subsequent conversational
  follow-up returned another grounded answer.
- A PDF citation opened the correct document at **page 25** in the UI.
- A whole-lecture summary HTTP request returned 200 with all five original
  transcript chunks available as evidence.
- An **eight-second MP4** passed through upload → real background Whisper → status
  → transcript API. It completed as one English segment using `openai-whisper`.
- UI, backend health, proxied transcript and PDF asset returned HTTP 200.

The included UI image is a captured smoke-test view, not a video recording.

## What has not been established

- Representative accuracy, translation quality or improved student learning.
- Timing or memory guarantees for two-to-three-hour recordings.
- Performance with many users, durable job processing or distributed indexing.
- General hallucination resistance; valid source IDs alone cannot prove meaning.
- Understanding images/diagrams/scanned PDFs, reliable rendered mathematics or
  proof of a slide's visibility at a particular video time.
- Real Polimi login, course enrollment, student-data isolation or production hosting.

A stronger evaluation should add held-out English/Italian lectures, bilingual
reviews, claim-by-claim citation auditing, unsupported/partly supported questions,
and recording-length and concurrency tests.
