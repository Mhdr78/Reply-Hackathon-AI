"""Persistent source/version catalog, caches, and a conservative spending ledger."""

from contextlib import contextmanager
import json
import math
from pathlib import Path
import sqlite3
import time
import uuid


class BudgetExceeded(ValueError):
    pass


class Catalog:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS manifests (scope TEXT PRIMARY KEY, data TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS chunks (id TEXT PRIMARY KEY, scope TEXT, version TEXT, data TEXT);
                CREATE INDEX IF NOT EXISTS chunks_scope_version ON chunks(scope, version);
                CREATE TABLE IF NOT EXISTS cache (kind TEXT, key TEXT, data TEXT, PRIMARY KEY(kind,key));
                CREATE TABLE IF NOT EXISTS spending (id TEXT PRIMARY KEY, operation TEXT, reserved REAL,
                    charged REAL, status TEXT, created REAL, usage TEXT);
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=30)
        try:
            with db:
                yield db
        finally:
            db.close()

    def manifest(self, scope):
        with self.connect() as db:
            row = db.execute("SELECT data FROM manifests WHERE scope=?", (scope,)).fetchone()
        return json.loads(row[0]) if row else None

    def activate(self, bundle):
        manifest = {k: v for k, v in bundle.items() if k != "chunks"}
        manifest["chunk_count"] = len(bundle["chunks"])
        with self.connect() as db:
            db.executemany("INSERT OR REPLACE INTO chunks VALUES (?,?,?,?)", [
                (c["chunk_id"], bundle["scope"], bundle["version"], json.dumps(c, ensure_ascii=False)) for c in bundle["chunks"]
            ])
            db.execute("INSERT OR REPLACE INTO manifests VALUES (?,?)", (bundle["scope"], json.dumps(manifest)))
            db.execute("DELETE FROM chunks WHERE scope=? AND version<>?", (bundle["scope"], bundle["version"]))
        return manifest

    def active_chunks(self, scope):
        manifest = self.manifest(scope)
        if not manifest:
            raise ValueError("This lecture is not indexed yet.")
        with self.connect() as db:
            rows = db.execute("SELECT data FROM chunks WHERE scope=? AND version=? ORDER BY rowid", (scope, manifest["version"])).fetchall()
        return manifest, [json.loads(row[0]) for row in rows]

    def get_cache(self, kind, key):
        with self.connect() as db:
            row = db.execute("SELECT data FROM cache WHERE kind=? AND key=?", (kind, key)).fetchone()
        return json.loads(row[0]) if row else None

    def put_cache(self, kind, key, value):
        with self.connect() as db:
            db.execute("INSERT OR REPLACE INTO cache VALUES (?,?,?)", (kind, key, json.dumps(value, ensure_ascii=False, allow_nan=False)))

    def reserve(self, operation, estimate, total_limit, request_limit):
        if not math.isfinite(estimate) or estimate <= 0 or estimate > request_limit:
            raise BudgetExceeded(f"Request estimate ${estimate:.6f} exceeds the ${request_limit:.2f} per-request limit.")
        identifier = str(uuid.uuid4())
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            used = db.execute("SELECT COALESCE(SUM(COALESCE(charged,reserved)),0) FROM spending").fetchone()[0]
            if used + estimate > total_limit:
                raise BudgetExceeded(f"Local RAG budget exhausted: ${used:.6f} used/reserved of ${total_limit:.2f}.")
            db.execute("INSERT INTO spending VALUES (?,?,?,?,?,?,?)", (identifier, operation, estimate, None, "reserved", time.time(), "{}"))
        return identifier

    def settle(self, identifier, usage):
        usage = usage if isinstance(usage, dict) else {}
        cost = usage.get("cost")
        if isinstance(cost, bool) or not isinstance(cost, (int, float)) or not math.isfinite(cost) or cost < 0:
            cost = None
        with self.connect() as db:
            db.execute("UPDATE spending SET charged=?,status=?,usage=? WHERE id=?",
                       (cost, "completed" if cost is not None else "completed_estimated", json.dumps(usage), identifier))

    def uncertain(self, identifier):
        with self.connect() as db:
            db.execute("UPDATE spending SET status='failed_reserved' WHERE id=?", (identifier,))

    def status(self):
        with self.connect() as db:
            used, calls = db.execute("SELECT COALESCE(SUM(COALESCE(charged,reserved)),0),COUNT(*) FROM spending").fetchone()
            lectures = [{k: v for k, v in json.loads(row[0]).items() if k != "source_segments"}
                        for row in db.execute("SELECT data FROM manifests")]
        return {"used_or_reserved_usd": used, "paid_requests_recorded": calls, "lectures": lectures}
