"""Persistent chats and messages (SQLite). Several chats per lecture; messages are ordered by `seq`."""

from contextlib import closing
from datetime import datetime, timezone
import json
import sqlite3
import uuid

from .errors import ApiError

SCHEMA = """
CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    lecture_id TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chats_by_lecture ON chats (lecture_id, updated_at);
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    selection TEXT,
    created_at TEXT NOT NULL,
    seq INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_by_chat ON messages (chat_id, seq);
"""
PREVIEW_CHARS = 140


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


class ChatStore:
    def __init__(self, path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with closing(self._connect()) as c, c:
            c.executescript(SCHEMA)

    def _connect(self):
        c = sqlite3.connect(self.path, timeout=10)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA foreign_keys = ON")
        return c

    @staticmethod
    def _message_dict(row):
        sel = json.loads(row["selection"]) if row["selection"] else None
        return dict(id=row["id"], role=row["role"], content=row["content"], createdAt=row["created_at"],
                    selection=sel)

    def _chat(self, c, chat_id):
        row = c.execute("SELECT * FROM chats WHERE id = ?", (chat_id,)).fetchone()
        if not row:
            raise ApiError(404, "NOT_FOUND", "Chat not found.")
        count = c.execute("SELECT COUNT(*) FROM messages WHERE chat_id = ?", (chat_id,)).fetchone()[0]
        last = c.execute("SELECT content FROM messages WHERE chat_id = ? AND role = 'user' ORDER BY seq DESC LIMIT 1",
                         (chat_id,)).fetchone()
        return dict(id=row["id"], lectureId=row["lecture_id"], title=row["title"], createdAt=row["created_at"],
                    updatedAt=row["updated_at"], messageCount=count, preview=last[0][:PREVIEW_CHARS] if last else None)

    def list_chats(self, lecture_id):
        with closing(self._connect()) as c:
            ids = [r[0] for r in c.execute(
                "SELECT id FROM chats WHERE lecture_id = ? ORDER BY updated_at DESC, created_at DESC", (lecture_id,))]
            return [self._chat(c, i) for i in ids]

    def create_chat(self, lecture_id, title):
        chat_id, ts = uuid.uuid4().hex, now()
        with closing(self._connect()) as c, c:
            c.execute("INSERT INTO chats VALUES (?, ?, ?, ?, ?)", (chat_id, lecture_id, title, ts, ts))
            return self._chat(c, chat_id)

    def get_chat(self, chat_id):
        with closing(self._connect()) as c:
            return self._chat(c, chat_id)

    def rename_chat(self, chat_id, title):
        with closing(self._connect()) as c, c:
            self._chat(c, chat_id)
            c.execute("UPDATE chats SET title = ? WHERE id = ?", (title, chat_id))
            return self._chat(c, chat_id)

    def delete_chat(self, chat_id):
        with closing(self._connect()) as c, c:
            self._chat(c, chat_id)
            c.execute("DELETE FROM chats WHERE id = ?", (chat_id,))

    def messages(self, chat_id):
        with closing(self._connect()) as c:
            self._chat(c, chat_id)
            return [self._message_dict(r) for r in
                    c.execute("SELECT * FROM messages WHERE chat_id = ? ORDER BY seq", (chat_id,))]

    def add_turn(self, chat_id, question, selection, answer, auto_title):
        """Store a question and its answer atomically (only after the answer succeeded)."""
        with closing(self._connect()) as c, c:
            chat = self._chat(c, chat_id)
            seq = c.execute("SELECT COALESCE(MAX(seq), 0) FROM messages WHERE chat_id = ?", (chat_id,)).fetchone()[0]
            ts = now()
            user = dict(id=uuid.uuid4().hex, role="user", content=question, createdAt=ts, selection=selection)
            assistant = dict(id=uuid.uuid4().hex, role="assistant", content=answer, createdAt=now(), selection=None)
            for i, m in enumerate((user, assistant), 1):
                c.execute("INSERT INTO messages VALUES (?, ?, ?, ?, ?, ?, ?)",
                          (m["id"], chat_id, m["role"], m["content"],
                           json.dumps(m["selection"]) if m["selection"] else None, m["createdAt"], seq + i))
            if chat["messageCount"] == 0 and auto_title:
                c.execute("UPDATE chats SET title = ? WHERE id = ?", (auto_title, chat_id))
            c.execute("UPDATE chats SET updated_at = ? WHERE id = ?", (assistant["createdAt"], chat_id))
            return self._chat(c, chat_id), user, assistant
