"""The spoken words and linked slides inside a selected time range."""

import math


def overlaps(start, end, lower, upper):
    return start < upper and end > lower


def select(lecture, start, end):
    if not (math.isfinite(start) and math.isfinite(end) and 0 <= start < end):
        raise ValueError("Specify a finite range with 0 <= start < end.")
    excerpts = []
    for segment in lecture["segments"]:
        if not overlaps(segment["start"], segment["end"], start, end):
            continue
        words = segment.get("words", [])
        complete = words and all(w.get("start") is not None and w.get("end") is not None
                                 for w in words)
        text = segment["text"]
        timing = "segment"
        if complete:
            text = " ".join(w["word"].strip() for w in words
                            if overlaps(w["start"], w["end"], start, end))
            timing = "word"
        if text.strip():
            excerpts.append(dict(segment_id=segment["segment_id"], text=text, timing=timing,
                                 start_s=segment["start"], end_s=segment["end"]))
    if not excerpts:
        raise ValueError("No spoken text overlaps that range.")
    matches = [link for link in lecture["links"]
               if overlaps(link["start_s"], link["end_s"], start, end)]
    matches.sort(key=lambda link: (link["match_status"] == "reviewed_content_match",
                                   link.get("score", 0)), reverse=True)
    return dict(start_s=start, end_s=end, transcript_excerpt=" ".join(x["text"] for x in excerpts),
                excerpt_parts=excerpts, matched_pdf_pages=matches)
