"""Finds the prepared database of an app lecture id (e.g. "ml-01"), preparing it automatically if needed.

1. Manual (optional): data/lectures.json maps ids to databases made with `lecturemind prepare`.
2. Automatic: otherwise the lecture is prepared on first use from the web app's media folder:
     <media>/<id>.json                 transcript (WhisperX-style JSON)
     <media>/<id>/materials.json       PDFs; the first "slides" file (or the first file) is used,
                                       with its time->page "links" as reviewed links
   The database is cached in <data>/prepared/<id>.sqlite3 and rebuilt only when the content of one of those
   files changes (which also clears its saved chapters).
"""

from contextlib import closing
import hashlib
import json
import os
import re
import sqlite3
import sys
import threading
import uuid

from ..sources import normalize_transcript, prepare_lecture
from .errors import ApiError, not_prepared

LECTURE_ID = re.compile(r"[\w-][\w.-]*")


class LectureRegistry:
    def __init__(self, overrides_file, media_dir, prepared_dir):
        self.base = overrides_file.parent
        self.overrides = {}
        if overrides_file.is_file():
            raw = json.loads(overrides_file.read_text(encoding="utf-8"))
            self.overrides = {k: (v if isinstance(v, str) else v["db"]) for k, v in raw.items()}
        self.media_dir = media_dir.resolve() if media_dir and media_dir.is_dir() else None
        self.prepared_dir = prepared_dir
        self._cache = {}
        self._lock = threading.Lock()
        self._prepare_locks = {}
        self._hashes = {}  # path -> ((size, mtime_ns), sha256), so unchanged files aren't hashed again

    # ---- public

    def load(self, lecture_id):
        """(db path, raw JSON row, parsed lecture). Raises ApiError(NOT_PREPARED) if the lecture can't be prepared."""
        path = self.database(lecture_id)
        mtime = path.stat().st_mtime_ns
        with self._lock:
            cached = self._cache.get(lecture_id)
            if cached and cached[0] == (path, mtime):
                return cached[1]
        with closing(sqlite3.connect(path)) as connection:
            row = connection.execute("SELECT data FROM lecture WHERE id = 1").fetchone()
        if not row:
            raise not_prepared("The lecture database is empty. Prepare it again.")
        value = (path, row[0], json.loads(row[0]))
        with self._lock:
            self._cache[lecture_id] = ((path, mtime), value)
        return value

    def database(self, lecture_id):
        """Database for this lecture, preparing it first if needed."""
        if lecture_id in self.overrides:
            path = (self.base / self.overrides[lecture_id]).resolve()
            if not path.is_file():
                raise not_prepared(f"{self.overrides[lecture_id]} (from lectures.json) does not exist.")
            return path
        if not LECTURE_ID.fullmatch(lecture_id):
            raise ApiError(400, "BAD_REQUEST", "Invalid lecture id.")
        return self._auto_prepare(lecture_id)

    # ---- automatic preparation

    def _sources(self, lecture_id):
        """(transcript path, pdf path, reviewed links), or ApiError(NOT_PREPARED) saying what is missing."""
        if not self.media_dir:
            raise not_prepared("The assistant has no sources for this lecture: the web app's media folder was not "
                               "found (start the server with --media-dir).")
        transcript = self.media_dir / f"{lecture_id}.json"
        if not transcript.is_file():
            raise not_prepared(f"The assistant needs a transcript file for this lecture (public/media/{lecture_id}.json).")
        manifest = self.media_dir / lecture_id / "materials.json"
        if not manifest.is_file():
            raise not_prepared(f"The assistant needs the lecture slides: list a PDF in "
                               f"public/media/{lecture_id}/materials.json.")
        try:
            files = json.loads(manifest.read_text(encoding="utf-8")).get("files") or []
        except (json.JSONDecodeError, AttributeError):
            raise not_prepared(f"public/media/{lecture_id}/materials.json is not valid JSON.") from None
        files = [f for f in files if isinstance(f, dict) and isinstance(f.get("file"), str)]
        pick = next((f for f in files if f.get("kind") == "slides"), files[0] if files else None)
        if not pick:
            raise not_prepared(f"No PDF is listed in public/media/{lecture_id}/materials.json.")
        pdf = (manifest.parent / pick["file"]).resolve()
        if manifest.parent not in pdf.parents or not pdf.is_file():
            raise not_prepared(f"The PDF {pick['file']!r} listed in materials.json was not found next to it.")
        return transcript, pdf, _reviewed_links(pick.get("links") or [])

    def _hash(self, path):
        st = path.stat()
        key = (st.st_size, st.st_mtime_ns)
        cached = self._hashes.get(path)
        if cached and cached[0] == key:
            return cached[1]
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        self._hashes[path] = (key, digest)
        return digest

    def _auto_prepare(self, lecture_id):
        transcript, pdf, links = self._sources(lecture_id)
        # Content-based: saving a file without changes doesn't re-prepare (which would clear the saved chapters).
        fingerprint = dict(transcript=self._hash(transcript), pdf=[pdf.name, self._hash(pdf)], links=links)
        db = self.prepared_dir / f"{lecture_id}.sqlite3"
        meta = self.prepared_dir / f"{lecture_id}.source.json"
        with self._lock:
            lock = self._prepare_locks.setdefault(lecture_id, threading.Lock())
        with lock:  # one preparation per lecture at a time
            if db.is_file() and meta.is_file() and json.loads(meta.read_text(encoding="utf-8")) == fingerprint:
                return db
            self.prepared_dir.mkdir(parents=True, exist_ok=True)
            tmp = self.prepared_dir / f".{lecture_id}.{uuid.uuid4().hex}.sqlite3"
            try:
                raw = json.loads(transcript.read_text(encoding="utf-8"))
                summary = prepare_lecture(normalize_transcript(raw, lecture_id), pdf, links, tmp)
                os.replace(tmp, db)
            except (ValueError, KeyError, TypeError, json.JSONDecodeError) as e:
                raise not_prepared(f"Preparing this lecture for the assistant failed: {e}") from None
            finally:
                _remove_quietly(tmp)
            meta.write_text(json.dumps(fingerprint), encoding="utf-8")
            print(f"Prepared {lecture_id}: {summary['segments']} segments, {summary['pages']} pages "
                  f"({pdf.name}), {summary['links']} links", file=sys.stderr)
            return db


def _reviewed_links(raw_links):
    """materials.json links ({start, end, page} or {start_s, end_s, page_number}) → reviewed links."""
    links = []
    for link in raw_links:
        try:
            links.append(dict(start_s=float(link.get("start", link.get("start_s"))),
                              end_s=float(link.get("end", link.get("end_s"))),
                              page_number=int(link.get("page", link.get("page_number")))))
        except (TypeError, ValueError, AttributeError):
            continue
    return links


def _remove_quietly(path):
    if path.exists():
        try:
            path.unlink()
        except OSError:
            pass
