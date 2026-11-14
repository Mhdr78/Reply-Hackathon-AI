"""Pure data adapters; no imports, files or side effects from the teammate's app."""

from copy import deepcopy

from lecture_translation.core import validate_source


def canonical_transcript(raw, *, lecture_id, source_video, language=None):
    """Adapt original Whisper/WhisperX JSON to the RAG input without changing it.

    The app's lecture ID is explicit because it may differ from the ASR job ID.
    Missing language must be supplied by the caller, never guessed as English.
    """
    if not isinstance(raw, dict):
        raise ValueError("Original transcript must be a JSON object.")
    result = deepcopy(raw)
    result.setdefault("schema_version", "1.0")
    result.setdefault("timestamp_unit", "seconds")
    result.update(lecture_id=lecture_id, source_video=source_video)
    if language is not None:
        result["language"] = language
    segments = result.get("segments")
    if not isinstance(segments, list) or any(not isinstance(s, dict) for s in segments):
        raise ValueError("Original transcript must contain segment objects.")
    for index, segment in enumerate(segments):
        if not segment.get("segment_id"):
            segment["segment_id"] = f"{lecture_id}_{index:05d}"
    validate_source(result)
    return result


def prepared_documents(prepared_lecture, *, document_id="slides"):
    """Reuse the existing backend's extracted pages, without reading its DB."""
    return [{"document_id": document_id, "name": prepared_lecture["pdf"],
             "pages": deepcopy(prepared_lecture["pages"])}]


def frontend_answer(result):
    """Render validated sources using the current UI's timestamp/PDF link syntax.

    Keep result['sources'] as structured data too; this only adapts message text.
    """
    if result["status"] != "answered":
        return result["answer"]
    sources = {s["citation_id"]: s for s in result["sources"]}

    def marker(source):
        if source["source_type"] == "pdf":
            return f"[PDF p. {source['page_number']}]"
        seconds = int(source["start_s"])
        return f"[{seconds // 60}:{seconds % 60:02d}]"

    return "\n\n".join(p["text"] + " " + " ".join(marker(sources[sid]) for sid in p["source_ids"])
                         for p in result["paragraphs"])
