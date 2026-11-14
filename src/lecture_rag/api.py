"""Standalone HTTP adapter; the retrieval service can also be called directly."""

from contextlib import asynccontextmanager
import threading
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

from .catalog import BudgetExceeded
from .service import RagService
from .settings import Settings


class Body(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class IndexRequest(Body):
    transcript: dict
    documents: list[dict] = Field(default_factory=list)
    course_id: str = "default"


class Selection(Body):
    start_s: float = Field(ge=0)
    end_s: float = Field(gt=0)


class SearchRequest(Body):
    lecture_id: str
    question: str = Field(min_length=1, max_length=4000)
    course_id: str = "default"
    top_k: int = Field(default=5, ge=1, le=8)
    selection: Selection | None = None
    current_time_s: float | None = Field(default=None, ge=0)
    rerank: bool | None = None


class AskRequest(SearchRequest):
    response_language: Literal["en", "it"] = "en"


def create_app(service=None):
    settings = service.settings if service else Settings.from_env()
    state_lock = threading.Lock()

    @asynccontextmanager
    async def lifespan(app):
        yield
        if service is None and app.state.rag is not None:
            app.state.rag.close()

    app = FastAPI(title="Lecture RAG API", version="1.0", lifespan=lifespan)
    app.state.rag = service
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins),
                       allow_methods=["GET", "POST"], allow_headers=["Content-Type"], allow_credentials=False)

    def get_service():
        with state_lock:
            if app.state.rag is None:
                app.state.rag = RagService(settings)
        return app.state.rag

    def run(operation):
        try:
            return operation(get_service())
        except BudgetExceeded as failure:
            raise HTTPException(402, str(failure)) from None
        except ValueError as failure:
            raise HTTPException(422, str(failure)) from None
        except (RuntimeError, OSError) as failure:
            raise HTTPException(503, str(failure)) from None

    @app.get("/health")
    def health():
        return run(lambda rag: {"status": "ok", "rag": rag.status()})

    @app.post("/rag/index")
    def index(body: IndexRequest):
        return run(lambda rag: rag.index_lecture(body.transcript, body.documents, body.course_id))

    @app.post("/rag/search")
    def search(body: SearchRequest):
        return run(lambda rag: rag.search(**body.model_dump()))

    @app.post("/rag/ask")
    def ask(body: AskRequest):
        return run(lambda rag: rag.ask(**body.model_dump()))

    return app


app = create_app()
