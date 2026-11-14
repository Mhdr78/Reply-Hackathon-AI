"""Build source-addressable transcript and PDF chunks without an LLM call."""

import hashlib
import json
from pathlib import Path
import re
import uuid

from lecture_translation.core import validate_source
from .settings import DEFAULT_EMBEDDING_MODEL

CHUNK_VERSION = "utf8-2400-overlap400-v1"


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False).encode()).hexdigest()


def scope_id(course_id, lecture_id):
    for value in (course_id, lecture_id):
        if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,120}", value):
            raise ValueError("Course and lecture IDs must use letters, digits, underscores or hyphens.")
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"lecture://{course_id}/{lecture_id}"))


def split_text(text, limit=2400):
    """Bound each embedding input by UTF-8 bytes, including unusual math/text."""
    result, current = [], ""
    for word in text.split():
        # An unusually long unbroken token must not bypass the input bound.
        fragments, fragment = [], ""
        for char in word:
            if len((fragment + char).encode()) > limit:
                fragments.append(fragment)
                fragment = ""
            fragment += char
        if fragment:
            fragments.append(fragment)
        for part in fragments:
            proposal = f"{current} {part}".strip()
            if current and len(proposal.encode()) > limit:
                result.append(current)
                current = part
            else:
                current = proposal
    if current:
        result.append(current)
    return result


def windows(pieces, limit=2400, overlap=400):
    start = 0
    while start < len(pieces):
        end, size = start, 0
        while end < len(pieces):
            extra = len(pieces[end]["text"].encode()) + 1
            if end > start and size + extra > limit:
                break
            size += extra
            end += 1
        yield pieces[start:end]
        if end == len(pieces):
            break
        following, used = end, 0
        while following > start + 1:
            extra = len(pieces[following - 1]["text"].encode()) + 1
            if used + extra > overlap:
                break
            used += extra
            following -= 1
        start = max(start + 1, following)


def extract_pdf(path, document_id=None):
    from pypdf import PdfReader

    path = Path(path).expanduser().resolve()
    if not path.is_file():
        raise ValueError(f"PDF not found: {path.name}")
    pages = []
    for number, page in enumerate(PdfReader(path).pages, 1):
        text = page.extract_text() or ""
        title = next((line.strip() for line in text.splitlines() if line.strip()), "")[:200]
        pages.append({"page_number": number, "title": title, "text": text})
    return {"document_id": document_id or path.stem, "name": path.name,
            "source_sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "pages": pages}


def build_chunks(transcript, documents=None, course_id="default", embedding_model=DEFAULT_EMBEDDING_MODEL):
    validate_source(transcript)
    documents = documents or []
    if not isinstance(documents, list):
        raise ValueError("documents must be a list of extracted PDF documents.")
    scope = scope_id(course_id, transcript["lecture_id"])
    normalized, skipped = [], []
    seen_documents = set()
    for document in documents:
        if not isinstance(document, dict):
            raise ValueError("Each document must contain document_id, name and pages.")
        did, name, pages = document.get("document_id"), document.get("name"), document.get("pages")
        if not isinstance(did, str) or not did or did in seen_documents or not isinstance(name, str) or not name:
            raise ValueError("PDF document IDs must be nonempty and unique, with a filename.")
        if not isinstance(pages, list):
            raise ValueError("Document pages must be a list.")
        seen_documents.add(did)
        page_numbers, cleaned = set(), []
        for page in pages:
            if not isinstance(page, dict):
                raise ValueError("Each PDF page must be an object.")
            number, text = page.get("page_number"), page.get("text")
            if isinstance(number, bool) or not isinstance(number, int) or number < 1 or number in page_numbers:
                raise ValueError("PDF page numbers must be positive and unique within a document.")
            if not isinstance(text, str):
                raise ValueError("Each PDF page must have a text string.")
            page_numbers.add(number)
            cleaned.append({"page_number": number, "title": str(page.get("title", ""))[:200], "text": text.strip()})
            if not text.strip():
                skipped.append({"document_id": did, "page_number": number})
        normalized.append({"document_id": did, "name": name, "language": document.get("language", transcript["language"]),
                           "source_sha256": document.get("source_sha256"), "pages": cleaned})
    version = digest({"transcript": transcript, "documents": normalized, "course_id": course_id,
                      "chunker": CHUNK_VERSION, "embedding_model": embedding_model})
    base = {"scope": scope, "version": version, "course_id": course_id, "lecture_id": transcript["lecture_id"],
            "source_video": transcript["source_video"], "embedding_model": embedding_model}
    chunks = []

    def add(text, metadata):
        chunk = {**base, **metadata, "text": text}
        chunk["chunk_index"] = len(chunks)
        chunk["chunk_id"] = str(uuid.uuid5(uuid.NAMESPACE_URL, digest(chunk)))
        chunks.append(chunk)

    pieces = []
    for segment in transcript["segments"]:
        for part in split_text(segment["text"]):
            pieces.append({"text": part, "segment_id": segment["segment_id"], "start": segment["start"], "end": segment["end"]})
    for window in windows(pieces):
        add(" ".join(p["text"] for p in window), {
            "source_type": "transcript", "language": transcript["language"],
            "segment_ids": list(dict.fromkeys(p["segment_id"] for p in window)),
            "start": min(p["start"] for p in window), "end": max(p["end"] for p in window),
        })
    for document in normalized:
        for page in document["pages"]:
            paragraphs = re.split(r"\n\s*\n|(?<=[.!?])\s+", page["text"])
            pieces = [{"text": part} for paragraph in paragraphs for part in split_text(paragraph, limit=600)]
            for window in windows(pieces):
                add(" ".join(p["text"] for p in window), {
                    "source_type": "pdf", "document_id": document["document_id"], "document_name": document["name"],
                    "page_number": page["page_number"], "title": page["title"], "language": document["language"],
                })
    return {"scope": scope, "version": version, "course_id": course_id, "lecture_id": transcript["lecture_id"],
            "language": transcript["language"], "source_video": transcript["source_video"], "source_segments": transcript["segments"],
            "embedding_model": embedding_model, "chunks": chunks, "empty_pdf_pages": skipped}
