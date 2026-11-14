"""Lecture preparation (offline): PDF text, transcript-to-slide links, and the lecture database.

A lecture database holds one prepared lecture:
    lecture           (id = 1) JSON: lecture_id, pdf, segments, pages, links
    lecture_chapters  (id = 1) JSON: saved chapters, cleared whenever the lecture is prepared again
"""

from collections import Counter
from contextlib import closing
import json
import math
from pathlib import Path
import re
import sqlite3
import subprocess

STOP = set(("the a an and or is are was were be been of on at to for with from "
            "this that it its as in by i you we they have has if so do will their "
            "which what about one can all just but there then our your").split())
WINDOW_S = 40  # transcript window matched against the slides


def tokenize(text):
    return [
        term[:-1] if term.endswith("s") and len(term) > 4 else term
        for term in re.findall(r"[a-z]{2,}", text.lower())
        if term not in STOP
    ]


# ---------------------------------------------------------------- PDF

def extract_pdf_pages(pdf):
    """[{page_number, title, text}] using Poppler's pdftotext. Raises ValueError if the text can't be read."""
    try:
        extracted = subprocess.run(
            ["pdftotext", "-layout", str(Path(pdf).resolve()), "-"],
            capture_output=True, check=True, encoding="utf-8",
        ).stdout
    except FileNotFoundError:
        raise ValueError("Install Poppler so pdftotext is available.") from None
    except subprocess.CalledProcessError:
        raise ValueError("pdftotext could not read the PDF.") from None
    texts = extracted.split("\f")
    if texts[-1] == "":
        texts.pop()
    if not any(page.strip() for page in texts):
        raise ValueError("The PDF contains no extractable text.")
    return [
        dict(page_number=i, title=page_title(page),
             text="\n".join(" ".join(line.split()) for line in page.splitlines() if line.strip()))
        for i, page in enumerate(texts, 1)
    ]


def page_title(page):
    """First non-empty line, cut at the first wide gap (layout columns)."""
    first = next((line.strip() for line in page.splitlines() if line.strip()), "")
    return re.split(r"\s{3,}", first, maxsplit=1)[0]


# ---------------------------------------------------------------- transcript ↔ slides

def match_pages(segments, pages, reviewed):
    """Suggested time→page links (lexical BM25-like match per ~40 s window), followed by the reviewed links."""
    documents = [Counter(tokenize(page["text"])) for page in pages]
    frequencies = Counter(term for doc in documents for term in doc)
    average_length = max(1, sum(map(Counter.total, documents)) / len(documents))
    links = []
    window = []
    windows = []
    for segment in segments:
        window.append(segment)
        if segment["end"] - window[0]["start"] >= WINDOW_S:
            windows.append(window)
            window = []
    if window:
        windows.append(window)

    for window in windows:
        start, end = window[0]["start"], max(s["end"] for s in window)
        terms = Counter(tokenize(" ".join(s["text"] for s in window)))
        candidates = []
        for page, doc in zip(pages, documents):
            common = terms.keys() & doc.keys()
            if len(common) < 3:
                continue
            norm = 0.3 + 0.9 * doc.total() / average_length
            score = sum(
                math.log1p((len(pages) - frequencies[term] + 0.5)
                           / (frequencies[term] + 0.5))
                * doc[term] / (doc[term] + norm)
                * (1 + math.log(terms[term]))
                for term in common
            )
            candidates.append((score, page["page_number"]))
        candidates.sort(reverse=True)
        if candidates:
            best = candidates[0][0]
            links.extend(
                dict(start_s=start, end_s=end, page_number=page,
                     match_status="suggested_content_match", score=round(score, 3))
                for score, page in candidates[:2] if score >= best * 0.75
            )
    return links + reviewed


def validate_reviewed_links(reviewed_links, page_count):
    reviewed = []
    for link in reviewed_links:
        start, end = link["start_s"], link["end_s"]
        page = link["page_number"]
        if not (0 <= start < end and isinstance(page, int) and 1 <= page <= page_count):
            raise ValueError("Invalid reviewed link range or page number.")
        reviewed.append(dict(start_s=start, end_s=end, page_number=page,
                             match_status="reviewed_content_match"))
    return reviewed


# ---------------------------------------------------------------- preparation

def prepare_lecture(transcript, pdf, reviewed_links, db):
    """Build and save the lecture timeline offline. `transcript` is the parsed JSON, `pdf` a Path,
    `reviewed_links` a list of {start_s, end_s, page_number}. Returns counts of what was saved."""
    if transcript.get("timestamp_unit") != "seconds":
        raise ValueError("Expected transcript timestamps in seconds.")
    segments = sorted(transcript["segments"], key=lambda s: s["start"])
    if not segments:
        raise ValueError("The transcript contains no segments.")
    pages = extract_pdf_pages(pdf)
    reviewed = validate_reviewed_links(reviewed_links, len(pages))
    links = match_pages(segments, pages, reviewed)
    save_lecture(db, dict(lecture_id=transcript["lecture_id"], pdf=Path(pdf).name,
                          segments=segments, pages=pages, links=links))
    return dict(segments=len(segments), pages=len(pages), links=len(links))


def normalize_transcript(raw, lecture_id):
    """Accept plain WhisperX output too: add the fields prepare_lecture expects (unit, lecture id, segment ids)."""
    transcript = dict(raw)
    transcript.setdefault("timestamp_unit", "seconds")
    transcript.setdefault("lecture_id", lecture_id)
    segments = sorted(raw.get("segments") or [], key=lambda s: s["start"])
    transcript["segments"] = [dict(s, segment_id=s.get("segment_id") or f"{lecture_id}_{i:05d}")
                              for i, s in enumerate(segments)]
    return transcript


# ---------------------------------------------------------------- lecture database

def ensure_chapter_table(connection):
    connection.execute("""
        CREATE TABLE IF NOT EXISTS lecture_chapters (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            data TEXT NOT NULL
        )
    """)


def save_lecture(db, lecture):
    """Replace the prepared lecture (and clear its chapters, which belong to the old sources)."""
    with closing(sqlite3.connect(db)) as connection, connection:
        connection.execute("CREATE TABLE IF NOT EXISTS lecture (id INTEGER PRIMARY KEY, data TEXT)")
        ensure_chapter_table(connection)
        connection.execute("DELETE FROM lecture_chapters")
        connection.execute("INSERT OR REPLACE INTO lecture VALUES (1, ?)", (json.dumps(lecture),))


def read_lecture_row(db):
    """The raw JSON of the prepared lecture. Raises ValueError if there is none."""
    if not Path(db).is_file():
        raise ValueError("Run prepare first to create the lecture database.")
    with closing(sqlite3.connect(db)) as connection:
        row = connection.execute("SELECT data FROM lecture WHERE id = 1").fetchone()
    if row is None:
        raise ValueError("The database has no prepared lecture. Run prepare.")
    return row[0]
