"""RAG configuration; source checkout and installed deployments share .env rules."""

from dataclasses import dataclass
import hashlib
import math
import os
from pathlib import Path
import re

from dotenv import dotenv_values
from lecture_translation.config import default_env_file

DEFAULT_EMBEDDING_MODEL = "local/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

@dataclass(frozen=True)
class Settings:
    data_dir: Path
    qdrant_url: str = ""
    qdrant_api_key: str = ""
    collection: str = "lecture_chunks_v1"
    embedding_model: str = DEFAULT_EMBEDDING_MODEL
    answer_model: str = "openai/gpt-6-luna"
    budget_usd: float = 1.0
    request_limit_usd: float = 0.03
    rerank: bool = True
    cors_origins: tuple[str, ...] = ("http://localhost:3000", "http://localhost:5173")

    @property
    def collection_name(self):
        # Separate vector spaces when the embedding model changes.
        suffix = hashlib.sha256(self.embedding_model.encode()).hexdigest()[:10]
        return f"{self.collection}_{suffix}"

    @classmethod
    def from_env(cls):
        env_file = default_env_file()
        values = dotenv_values(env_file, interpolate=False) if env_file.is_file() else {}

        def get(name, default):
            return values.get(name) or os.environ.get(name) or default

        path = Path(get("RAG_DATA_DIR", ".local/rag")).expanduser()
        if not path.is_absolute():
            path = env_file.parent / path
        result = cls(
            data_dir=path.resolve(), qdrant_url=get("QDRANT_URL", ""),
            qdrant_api_key=get("QDRANT_API_KEY", ""),
            collection=get("QDRANT_COLLECTION", "lecture_chunks_v1"),
            embedding_model=get("RAG_EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL),
            answer_model=get("RAG_ANSWER_MODEL", "openai/gpt-6-luna"),
            budget_usd=float(get("RAG_BUDGET_USD", "1.0")),
            request_limit_usd=float(get("RAG_REQUEST_LIMIT_USD", "0.03")),
            rerank=get("RAG_RERANK", "true").lower() == "true",
            cors_origins=tuple(x.strip() for x in get("RAG_CORS_ORIGINS", "http://localhost:3000,http://localhost:5173").split(",") if x.strip()),
        )
        if not re.fullmatch(r"[A-Za-z0-9_-]+", result.collection):
            raise ValueError("QDRANT_COLLECTION must use letters, digits, underscores or hyphens.")
        if any(not math.isfinite(x) or x <= 0 for x in (result.budget_usd, result.request_limit_usd)):
            raise ValueError("RAG budget limits must be finite and positive.")
        return result
