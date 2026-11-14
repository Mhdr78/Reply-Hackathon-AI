"""Use cases behind the HTTP API: lecture status, chapters and answering questions in a chat."""

import json
import math
import re
import threading

from .. import chapters, llm, prompts
from ..selection import select
from .chats import ChatStore
from .errors import ApiError
from .fake import fake_answer, fake_chapters, fmt
from .registry import LectureRegistry

HISTORY_MESSAGES = 10  # earlier messages (user + assistant) sent with each question
MAX_QUESTION_CHARS = 4000
MAX_TITLE_CHARS = 120


class LectureMindService:
    def __init__(self, settings):
        self.settings = settings
        self.lectures = LectureRegistry(settings.overrides_file, settings.media_dir, settings.prepared_dir)
        self.chats = ChatStore(settings.chats_db)
        self._chapter_locks = {}
        self._lock = threading.Lock()

    # ---- lectures

    def lecture_status(self, lecture_id):
        """Prepares the lecture on first use, so opening a lecture page is enough."""
        try:
            _, _, lecture = self.lectures.load(lecture_id)
        except ApiError as e:
            if e.code != "NOT_PREPARED":
                raise
            return dict(lecture_id=lecture_id, prepared=False, reason=e.message)
        return dict(lecture_id=lecture_id, prepared=True, pdf=lecture["pdf"],
                    segments=len(lecture["segments"]), pages=len(lecture["pages"]))

    # ---- chapters

    def get_chapters(self, lecture_id):
        path, _, _ = self.lectures.load(lecture_id)
        raw = chapters.load_chapters(path)
        if not raw:
            raise ApiError(404, "NOT_GENERATED", "Chapters have not been generated for this lecture yet.")
        return _chapters_response(lecture_id, raw, "llm")

    def generate_chapters(self, lecture_id, force=False):
        path, source_data, lecture = self.lectures.load(lecture_id)
        if self.settings.fake_llm:  # never saved, so a real run later is not blocked by fake chapters
            return _chapters_response(lecture_id, fake_chapters(lecture), "fake")
        with self._lock:
            lock = self._chapter_locks.setdefault(lecture_id, threading.Lock())
        with lock:  # one LLM call per lecture at a time; later callers get the saved result
            try:
                raw = chapters.generate_chapters(path, lecture, source_data, self.settings.env_file,
                                                 self.settings.model, force=force)
            except ValueError as e:
                raise ApiError(502, "LLM_FAILED", str(e)) from None
        return _chapters_response(lecture_id, raw, "llm")

    # ---- chats

    def create_chat(self, lecture_id, title):
        title = str(title or "New chat").strip()[:MAX_TITLE_CHARS] or "New chat"
        return self.chats.create_chat(lecture_id, title)

    def rename_chat(self, chat_id, title):
        title = str(title or "").strip()[:MAX_TITLE_CHARS]
        if not title:
            raise ApiError(400, "BAD_REQUEST", "Title is empty.")
        return self.chats.rename_chat(chat_id, title)

    def ask(self, chat_id, content, raw_selection=None):
        """Answer a question (optionally about a time range) with the chat's recent history; store both on success."""
        chat = self.chats.get_chat(chat_id)
        question = str(content or "").strip()
        if not question:
            raise ApiError(400, "BAD_REQUEST", "The question is empty.")
        if len(question) > MAX_QUESTION_CHARS:
            raise ApiError(400, "BAD_REQUEST", f"Questions are limited to {MAX_QUESTION_CHARS} characters.")
        _, _, lecture = self.lectures.load(chat["lectureId"])
        selection, stored_selection = _parse_selection(lecture, raw_selection)
        history = self._history(chat_id)

        if self.settings.fake_llm:
            answer = fake_answer(lecture, selection, question, history)
        else:
            messages = prompts.build_messages(lecture, selection, question, history)
            try:
                answer = llm.complete_messages(messages, self.settings.env_file, self.settings.model)
            except ValueError as e:
                raise ApiError(502, "LLM_FAILED", str(e)) from None

        chat, user, assistant = self.chats.add_turn(chat_id, question, stored_selection, answer,
                                                    _title_from(question, stored_selection))
        return dict(chat=chat, user=user, assistant=assistant)

    def _history(self, chat_id):
        history = []
        for m in self.chats.messages(chat_id)[-HISTORY_MESSAGES:]:
            turn = dict(role=m["role"], content=m["content"])
            if m["selection"]:
                turn["selection"] = dict(start_s=m["selection"]["start"], end_s=m["selection"]["end"])
            history.append(turn)
        if history and history[0]["role"] == "assistant":
            history = history[1:]
        return history


def _parse_selection(lecture, raw):
    """(selection for the prompt, {start, end} to store), or (None, None) for a general question."""
    if not raw:
        return None, None
    try:
        start, end = float(raw["start"]), float(raw["end"])
    except (KeyError, TypeError, ValueError):
        raise ApiError(400, "BAD_REQUEST", "selection needs numeric start and end.") from None
    if not (math.isfinite(start) and math.isfinite(end) and 0 <= start < end):
        raise ApiError(400, "BAD_REQUEST", "Select a range with 0 <= start < end.")
    try:
        return select(lecture, start, end), dict(start=start, end=end)
    except ValueError as e:
        raise ApiError(400, "BAD_REQUEST", str(e)) from None


def _title_from(question, selection):
    text = re.sub(r"\s+", " ", question).strip()
    if len(text) > 60:
        text = text[:57].rsplit(" ", 1)[0] + "…"
    return text or ("Question about " + fmt(selection["start"]) if selection else "New chat")


def _chapters_response(lecture_id, raw, source):
    data = json.loads(raw)
    return dict(lectureId=lecture_id, source=source, durationS=data["duration_s"],
                durationSource=data["duration_source"],
                chapters=[dict(id=f"ch-{i}", title=c["title"], start=c["start_s"], end=c["end_s"],
                               startSegmentId=c["start_segment_id"])
                          for i, c in enumerate(data["chapters"], 1)])
