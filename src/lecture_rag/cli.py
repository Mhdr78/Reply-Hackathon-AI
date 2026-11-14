"""Index, search and ask over lecture sources, or expose the integration API."""

import argparse
import json
from pathlib import Path

from .chunks import build_chunks, extract_pdf
from .service import RagService
from .settings import Settings


def print_json(value):
    print(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    index = commands.add_parser("index", help="Index canonical transcript JSON and optional PDFs")
    index.add_argument("--transcript", type=Path, required=True)
    index.add_argument("--pdf", type=Path, action="append", default=[])
    index.add_argument("--documents-json", type=Path, help="Already-extracted documents list from another backend")
    index.add_argument("--course-id", default="default")
    index.add_argument("--dry-run", action="store_true", help="Build chunks only: no database or paid API calls")
    for name in ("search", "ask"):
        sub = commands.add_parser(name)
        sub.add_argument("question")
        sub.add_argument("--lecture-id", required=True)
        sub.add_argument("--course-id", default="default")
        sub.add_argument("--top-k", type=int, default=5)
        sub.add_argument("--start", type=float)
        sub.add_argument("--end", type=float)
        sub.add_argument("--current-time", type=float)
        sub.add_argument("--no-rerank", action="store_true")
        if name == "ask":
            sub.add_argument("--response-language", choices=["en", "it"], default="en")
    commands.add_parser("status")
    evaluate = commands.add_parser("evaluate")
    evaluate.add_argument("--cases", type=Path, required=True)
    evaluate.add_argument("--with-answers", action="store_true", help="Also spend model calls on reranking/answerability checks")
    serve = commands.add_parser("serve")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8010)
    args = parser.parse_args()
    try:
        settings = Settings.from_env()
        if args.command == "serve":
            import uvicorn
            from .api import create_app
            uvicorn.run(create_app(), host=args.host, port=args.port)
            return 0
        if args.command == "index":
            transcript = json.loads(args.transcript.expanduser().read_text(encoding="utf-8"))
            documents = json.loads(args.documents_json.read_text(encoding="utf-8")) if args.documents_json else []
            documents.extend(extract_pdf(path) for path in args.pdf)
            if args.dry_run:
                bundle = build_chunks(transcript, documents, args.course_id, settings.embedding_model)
                print_json({"lecture_id": bundle["lecture_id"], "version": bundle["version"], "chunk_count": len(bundle["chunks"]),
                            "transcript_chunks": sum(c["source_type"] == "transcript" for c in bundle["chunks"]),
                            "pdf_chunks": sum(c["source_type"] == "pdf" for c in bundle["chunks"]),
                            "empty_pdf_pages": bundle["empty_pdf_pages"], "paid_requests": 0})
                return 0
            with RagService(settings) as rag:
                print_json(rag.index_lecture(transcript, documents, args.course_id))
            return 0
        with RagService(settings) as rag:
            if args.command == "status":
                print_json(rag.status())
            elif args.command == "evaluate":
                from .evaluation import evaluate
                cases = json.loads(args.cases.read_text(encoding="utf-8"))
                print_json(evaluate(rag, cases, args.with_answers))
            else:
                if (args.start is None) != (args.end is None):
                    raise ValueError("Use --start and --end together.")
                options = {"lecture_id": args.lecture_id, "question": args.question, "course_id": args.course_id,
                           "top_k": args.top_k, "selection": {"start_s": args.start, "end_s": args.end} if args.start is not None else None,
                           "current_time_s": args.current_time, "rerank": False if args.no_rerank else None}
                if args.command == "ask":
                    options["response_language"] = args.response_language
                    print_json(rag.ask(**options))
                else:
                    print_json(rag.search(**options))
        return 0
    except (ValueError, RuntimeError, OSError) as failure:
        parser.exit(1, f"RAG failed: {failure}\n")


if __name__ == "__main__":
    raise SystemExit(main())
