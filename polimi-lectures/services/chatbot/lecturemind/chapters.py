"""LLM chapter generation: validation of the model's answer and storage in the lecture database."""

from contextlib import closing
import json
import math
from pathlib import Path
import re
import sqlite3

from . import llm
from .prompts import CHAPTER_SYSTEM, chapter_payload
from .sources import ensure_chapter_table


def validate_chapters(response, segments, duration):
    # Some models wrap the JSON in a Markdown code fence.
    response = re.sub(r"^```(?:json)?\s*|\s*```$", "", response.strip(), flags=re.I)
    try:
        document = json.loads(response)
    except json.JSONDecodeError:
        raise ValueError("The model did not return valid chapter JSON. Try again.") from None
    proposals = document.get("chapters") if isinstance(document, dict) else None
    if not isinstance(proposals, list) or not proposals:
        raise ValueError("The model must return a nonempty chapters array.")

    starts = {segment["segment_id"]: segment["start"] for segment in segments}
    result = []
    previous = -1.0
    for proposal in proposals:
        item = proposal if isinstance(proposal, dict) else {}
        title, segment_id = item.get("title"), item.get("start_segment_id")
        if not isinstance(title, str) or not 0 < len(title.strip()) <= 100:
            raise ValueError("Each chapter must have a title of 1–100 characters.")
        if not isinstance(segment_id, str) or segment_id not in starts:
            raise ValueError("The model returned an unknown chapter start segment.")
        if not result and segment_id != segments[0]["segment_id"]:
            raise ValueError("The first chapter must start at the first transcript segment.")
        start = starts[segment_id]
        if not previous < start < duration:
            raise ValueError("Chapter starts must be chronological and inside the timeline.")
        if result:
            result[-1]["end_s"] = start
        result.append(dict(title=title.strip(), start_segment_id=segment_id,
                           start_s=start if result else 0.0, end_s=duration))
        previous = start
    return result


def load_chapters(db):
    """Saved chapters as a JSON string, or None if they have not been generated."""
    with closing(sqlite3.connect(db)) as connection, connection:
        ensure_chapter_table(connection)
        existing = connection.execute("SELECT data FROM lecture_chapters WHERE id = 1").fetchone()
    return existing[0] if existing else None


def generate_chapters(db, lecture, source_data, env_file=Path(".env"), model=None,
                      duration=None, force=False):
    """Return saved chapters (JSON string), generating and saving them with the LLM if needed."""
    existing = load_chapters(db)
    last_speech = max(segment["end"] for segment in lecture["segments"])
    explicit = duration is not None
    duration = duration if explicit else last_speech
    if not math.isfinite(duration) or duration <= 0 or duration < last_speech:
        raise ValueError("Duration must be finite and at least the end of the transcript.")
    duration_source = "video_duration" if explicit else "transcript_end"
    if existing and not force:
        cached = json.loads(existing)
        if explicit and (cached["duration_s"] != duration
                         or cached["duration_source"] != duration_source):
            raise ValueError("Pass --force to regenerate chapters with the new duration.")
        return existing

    response = llm.complete(CHAPTER_SYSTEM, chapter_payload(lecture), env_file, model)
    chapters = validate_chapters(response, lecture["segments"], duration)
    output = json.dumps(dict(lecture_id=lecture["lecture_id"], duration_s=duration,
                             duration_source=duration_source, chapters=chapters),
                        ensure_ascii=False, indent=2)
    with closing(sqlite3.connect(db)) as connection, connection:
        connection.execute("BEGIN IMMEDIATE")
        current = connection.execute("SELECT data FROM lecture WHERE id = 1").fetchone()
        if current != (source_data,):
            raise ValueError("The lecture changed during generation. Run generate-chapters again.")
        connection.execute("INSERT OR REPLACE INTO lecture_chapters VALUES (1, ?)", (output,))
    return output
