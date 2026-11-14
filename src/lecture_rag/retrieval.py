"""Multilingual dense retrieval is fused with exact lexical BM25 evidence."""

from collections import Counter
import math
import re
import unicodedata

from .chunks import digest

STOP = set("the a an and or of to for with from this that is are was were what why how il lo la gli le un una uno e o di del della dei delle da in con per che come perché cosa quale quali".split())


def terms(text):
    return [word for word in re.findall(r"\w+(?:[-+]\w+)*", unicodedata.normalize("NFKC", text).casefold()) if word not in STOP]


def bm25(question, chunks, limit=20):
    query = Counter(terms(question))
    documents = [Counter(terms(c.get("title", "") + " " + c["text"])) for c in chunks]
    frequencies = Counter(term for document in documents for term in document)
    average = sum(sum(document.values()) for document in documents) / max(1, len(documents)) or 1
    ranked = []
    for chunk, document in zip(chunks, documents):
        length, score = sum(document.values()), 0.0
        for term, weight in query.items():
            tf = document.get(term, 0)
            if tf:
                idf = math.log(1 + (len(documents) - frequencies[term] + 0.5) / (frequencies[term] + 0.5))
                score += idf * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * length / average)) * weight
        if score > 0:
            ranked.append({**chunk, "lexical_score": score})
    return sorted(ranked, key=lambda c: (-c["lexical_score"], c["chunk_id"]))[:limit]


def fuse(dense, lexical, limit=20):
    combined = {}
    for ranking in (dense, lexical):
        for rank, chunk in enumerate(ranking, 1):
            item = combined.setdefault(chunk["chunk_id"], {**chunk, "rrf_score": 0.0})
            item.update({key: chunk[key] for key in ("dense_score", "lexical_score") if key in chunk})
            item["rrf_score"] += 1 / (60 + rank)
    ranked = sorted(combined.values(), key=lambda c: (-c["rrf_score"], c["chunk_id"]))
    selected = []
    for chunk in ranked:
        duplicate = False
        for previous in selected:
            if chunk["source_type"] == previous["source_type"] == "transcript":
                left, right = set(chunk["segment_ids"]), set(previous["segment_ids"])
                duplicate = len(left & right) / max(1, min(len(left), len(right))) > 0.8
            elif chunk["source_type"] == previous["source_type"] == "pdf":
                duplicate = (chunk["document_id"] == previous["document_id"] and chunk["page_number"] == previous["page_number"] and chunk["text"] == previous["text"])
            if duplicate:
                break
        if not duplicate:
            selected.append(chunk)
        if len(selected) >= limit:
            break
    return selected


def selection_chunk(manifest, start, end):
    if not all(isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) for x in (start, end)) or not 0 <= start < end:
        raise ValueError("Selection must satisfy 0 <= start_s < end_s with finite seconds.")
    pieces, ids, starts, ends = [], [], [], []
    for segment in manifest["source_segments"]:
        if segment["start"] >= end or segment["end"] <= start:
            continue
        words = segment.get("words", [])
        valid_words = isinstance(words, list) and words and all(
            isinstance(w, dict) and isinstance(w.get("word"), str)
            and all(isinstance(w.get(k), (int, float)) and not isinstance(w[k], bool)
                    and math.isfinite(w[k]) for k in ("start", "end"))
            and segment["start"] <= w["start"] < w["end"] <= segment["end"]
            for w in words
        )
        if valid_words:
            selected = [w for w in words if w["start"] < end and w["end"] > start]
            text = " ".join(w["word"].strip() for w in selected)
            if not text.strip():
                continue
            starts.append(min(w["start"] for w in selected)); ends.append(max(w["end"] for w in selected))
        else:
            text = segment["text"]
            starts.append(segment["start"]); ends.append(segment["end"])
        ids.append(segment["segment_id"]); pieces.append(text)
    if not pieces:
        raise ValueError("No spoken text overlaps the selected range.")
    result = {"source_type": "transcript_selection", "scope": manifest["scope"], "version": manifest["version"],
              "lecture_id": manifest["lecture_id"], "course_id": manifest["course_id"], "language": manifest["language"],
              "start": min(starts), "end": max(ends), "segment_ids": ids, "text": " ".join(pieces)}
    result["chunk_id"] = digest({"scope": manifest["scope"], "version": manifest["version"], "start": start, "end": end})
    return result
