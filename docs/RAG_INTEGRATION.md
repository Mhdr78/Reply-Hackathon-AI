# RAG integration contract for the teammate's backend and UI

The `lecture_rag` package is separate from the prototype. The prototype's
`lecture_cli.py`, SQLite database, source PDF and reviewed-link JSON are not
part of this change. The teammate may add their implementation independently.

## Current UI/server compatibility

The UI now calls the unified API in `lecture_rag.unified_api` on port 8787.
Its persistent chat routes use RAG, with independent English/Italian answer and
transcript-language controls. [APP_INTEGRATION.md](APP_INTEGRATION.md) describes
startup, the complete manual test and remaining demo-only features.

The older standalone `LectureMindService.ask` remains available for its CLI;
`npm run chatbot` now starts the integrated server instead. The adapter example
below documents the underlying interfaces for alternate integrations.

The existing chat server can keep its chat storage, routes and chapter generation.
Replace only its answer-generation step when integrating. Use one `RagService`
instance for the server lifetime and close it at shutdown; index once per source
change before answering. Example data bridge, to be wired by the teammate:

```python
from lecture_rag.adapters import canonical_transcript, prepared_documents, frontend_answer

# raw_asr is the ORIGINAL JSON from public/media/<app_lecture_id>.json.
# prepared_lecture is the parsed dictionary returned by LectureRegistry.load().
# Its reduced prepared JSON drops source metadata: do not use it as raw_asr.
source = canonical_transcript(
    raw_asr,
    lecture_id=app_lecture_id,       # e.g. "ml-01", consistently for index/ask
    source_video=f"{app_lecture_id}.mp4",
    # language="it",               # required only if raw_asr has no language
)
rag.index_lecture(source, prepared_documents(prepared_lecture), course_id=course_id)
result = rag.ask(
    lecture_id=app_lecture_id,
    course_id=course_id,
    question=question,
    response_language="it",
    selection={"start_s": raw_selection["start"], "end_s": raw_selection["end"]}
              if raw_selection else None,
)
answer_text = frontend_answer(result)
# Store answer_text through the existing chats.add_turn(...).
# Preserve result["sources"] for richer structured citation rendering later.
```

The adapter is independent code and does not import the teammate's package.
It preserves existing segment IDs and assigns stable IDs only when absent.
`frontend_answer` renders the current UI's `[m:ss]` and `[PDF p. N]` syntax.
That legacy PDF marker has no document ID; with multiple PDFs the UI must use
structured `sources` to choose the correct document. Raw RAG `answer` uses
`[S1]` markers and needs such a renderer before the old UI can navigate them.

The RAG API accepts a standalone question, not chat history. Until a follow-up
question reformulation step is added, send an explicit question such as
"Explain the bias column" rather than an isolated "why?" from conversation
history. Whole-lecture chapter generation remains the teammate's separate path.

## Stable Python interface

```python
from lecture_rag import RagService

rag = RagService()  # Create once per process; close on shutdown.

documents = [{
    "document_id": "slides",
    "name": "slides.pdf",
    "pages": prepared_lecture["pages"],
}]
index_result = rag.index_lecture(
    original_transcript,
    documents=documents,
    course_id="machine_learning",
)
answer = rag.ask(
    lecture_id=original_transcript["lecture_id"],
    course_id="machine_learning",
    question="Why does the first weight matrix have I+1 columns?",
    response_language="it",
    selection={"start_s": 331.6, "end_s": 366.6},
)
rag.close()
```

`original_transcript` is the original Whisper JSON, including schema version,
lecture ID, language, timestamp unit and segments. Use it rather than losing
its language/version fields when saving a smaller prototype-specific structure.
`prepared_lecture["pages"]` may be the prototype's already-extracted list of
`page_number`, `title`, and `text`; no duplicate PDF extraction is necessary.
Use the same `course_id` and `lecture_id` consistently for index/search/ask.

Already-reviewed timeline links remain available to the teammate's UI. They are
not treated as proven slide visibility or mandatory citations by this RAG.

## HTTP interface

Start `python rag.py serve --port 8010`, then use these endpoints. The browser
never sends an OpenRouter key and does not supply arbitrary filesystem paths.

### POST /rag/index

```json
{
  "course_id": "machine_learning",
  "transcript": {
    "schema_version": "1.0",
    "lecture_id": "lecture_001",
    "source_video": "lecture.mp4",
    "language": "en",
    "timestamp_unit": "seconds",
    "text": "A bias uses a constant input.",
    "segments": [{
      "segment_id": "lecture_001_00000",
      "start": 10,
      "end": 15,
      "text": "A bias uses a constant input.",
      "words": []
    }]
  },
  "documents": [{
    "document_id": "slides",
    "name": "slides.pdf",
    "language": "en",
    "pages": [{"page_number": 17, "title": "Feed Forward Neural Networks", "text": "The bias is attached to a constant input."}]
  }]
}
```

For the actual class, supply the complete original transcript and page list.
Document IDs must be unique within a lecture; page numbers are one-based.
Omit `documents` to index transcript-only sources. Optional `source_sha256` on
a document can identify the original binary asset, including visual changes.
JSON input never causes this endpoint to read a client-provided local path.

The response includes `lecture_id`, source `version`, `chunk_count`, whether
the saved index was `reused`, and `empty_pdf_pages`. Call indexing when assets
change, not before every question.

### POST /rag/search and POST /rag/ask

```json
{
  "course_id": "machine_learning",
  "lecture_id": "lecture_001",
  "question": "Perché la matrice dei pesi ha I+1 colonne?",
  "response_language": "it",
  "selection": {"start_s": 331.6, "end_s": 366.6},
  "top_k": 5
}
```

The example is an `/rag/ask` body. For `/rag/search`, omit `response_language`.
Selection is optional. Alternatively provide `current_time_s`; explicit
selection takes precedence. Source timelines stay in original video seconds.
`response_language` is `en` or `it`, independent of the recording/question.
`top_k` ranges from 1 to 8. `rerank: false` disables the reranker for diagnostics.

Search returns ranked `hits` with text, source identifiers and citation metadata.
Ask returns this shape (illustrative answer, not a stored source assertion):

```json
{
  "lecture_id": "lecture_001",
  "version": "source-version-hash",
  "response_language": "it",
  "status": "answered",
  "answer": "La colonna aggiuntiva rappresenta il bias. [S1]",
  "paragraphs": [{"text": "La colonna aggiuntiva rappresenta il bias.", "source_ids": ["S1"]}],
  "sources": [{
    "citation_id": "S1",
    "chunk_id": "source-chunk-id",
    "source_type": "transcript",
    "course_id": "machine_learning",
    "lecture_id": "lecture_001",
    "version": "source-version-hash",
    "start_s": 331.6,
    "end_s": 366.6,
    "segment_ids": ["source-segment-id"],
    "text": "The supporting source passage."
  }],
  "cached": false,
  "retrieval": {"candidate_count": 20, "reranked": true}
}
```

Transcript citations contain `start_s`, `end_s` and original `segment_ids`.
PDF citations contain `document_id`, `document_name` and `page_number` instead
of invented video timestamps. Returned source times/pages are attached by code,
not accepted from LLM output. Build UI links from these fields:

- `[S1]` with transcript source -> seek the original video to `start_s`.
- `[S2]` with PDF source -> open the document at `page_number`.
- `status=insufficient_evidence` -> display the message; do not invent citations.

The RAG contract uses `start_s/end_s` for response citations. Existing original
and translated transcript files keep their `start/end` schema. Preserve this
distinction in the frontend adapter.

### GET /health

Returns service status, active lecture versions, selected models and the local
RAG spending ledger. It does not include API keys or complete source transcripts.
`used_or_reserved_usd` is local RAG accounting, not the OpenRouter wallet balance.

## Failure handling and deployment boundary

- 422: malformed sources, selection, question or model evidence output.
- 402: local RAG budget limit reached.
- 503: provider/local runtime unavailable; inspect logs before repeating a paid call.

The API is synchronous and serializes access to the locally owned Qdrant client.
The UI should display a loading state. Sources are indexed once and reused.
Do not call the prototype's full-context LLM path as an additional step after
RAG: use the returned answer, or use `/rag/search` and generate an answer in the
teammate's backend under the same citation/evidence policy.

Course/lecture filters isolate retrieval data, but do not replace user
authentication. Apply the host application's authorization before exposing
these routes outside the local prototype. The RAG module does not implement
student accounts, chat history, uploads, visual slide recognition, or OCR.
