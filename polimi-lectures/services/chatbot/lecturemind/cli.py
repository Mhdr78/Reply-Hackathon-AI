"""Preprocess lecture sources and explain timestamp selections through OpenRouter."""

import argparse
import json
from pathlib import Path
import sqlite3
import sys

from . import chapters, llm, prompts
from .selection import select
from .sources import prepare_lecture, read_lecture_row


def cmd_prepare(args):
    transcript = json.loads(args.transcript.read_text(encoding="utf-8"))
    reviewed = (json.loads(args.reviewed_links.read_text(encoding="utf-8"))
                if args.reviewed_links else [])
    summary = prepare_lecture(transcript, args.pdf, reviewed, args.db)
    print(f"Prepared {summary['segments']} segments, {summary['pages']} pages and {summary['links']} links.")


def cmd_chapters(args, lecture, source_data):
    if args.command == "chapters":
        existing = chapters.load_chapters(args.db)
        if not existing:
            raise ValueError("Run generate-chapters first.")
        print(existing)
        return
    if args.dry_run:
        print(json.dumps(prompts.chapter_payload(lecture), ensure_ascii=False, indent=2))
        return
    print(chapters.generate_chapters(args.db, lecture, source_data, args.env_file, args.model,
                                     args.duration, args.force))


def cmd_show_or_ask(args, lecture):
    if args.command == "ask" and args.start is None and args.end is None:
        selection = None  # a general question about the whole lecture
    elif args.start is None or args.end is None:
        raise ValueError("Specify both --start and --end, or neither for a general question.")
    else:
        selection = select(lecture, args.start, args.end)
    if args.command == "show":
        print(json.dumps(selection, ensure_ascii=False, indent=2))
        return
    payload = prompts.payload_for(lecture, selection, args.question)
    if args.dry_run:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(llm.complete(prompts.answer_system(selection), payload, args.env_file, args.model))


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=Path("lecture.sqlite3"))
    commands = parser.add_subparsers(dest="command", required=True)
    prepare = commands.add_parser("prepare", help="Build and save the lecture timeline offline")
    prepare.add_argument("--transcript", type=Path, required=True)
    prepare.add_argument("--pdf", type=Path, required=True)
    prepare.add_argument("--reviewed-links", type=Path)
    commands.add_parser("timeline", help="List timestamp-to-page links")
    for command in ("show", "ask"):
        sub = commands.add_parser(command)
        # `ask` without --start/--end asks a general question about the whole lecture.
        sub.add_argument("--start", type=float, required=command == "show", help="Start in seconds")
        sub.add_argument("--end", type=float, required=command == "show", help="End in seconds")
        if command == "ask":
            sub.add_argument("question")
            sub.add_argument("--env-file", type=Path, default=Path(".env"))
            sub.add_argument("--model")
            sub.add_argument("--dry-run", action="store_true", help="Print payload locally")
    commands.add_parser("chapters", help="Print saved chapters as JSON")
    generate = commands.add_parser("generate-chapters", help="Generate or load lecture chapter names")
    generate.add_argument("--env-file", type=Path, default=Path(".env"))
    generate.add_argument("--model")
    generate.add_argument("--force", action="store_true", help="Replace saved chapters")
    generate.add_argument("--duration", type=float, help="Actual video duration in seconds")
    generate.add_argument("--dry-run", action="store_true", help="Print the model input locally")
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    try:
        if args.command == "prepare":
            cmd_prepare(args)
            return 0
        source_data = read_lecture_row(args.db)
        lecture = json.loads(source_data)
        if args.command == "timeline":
            print(json.dumps(sorted(lecture["links"], key=lambda link: link["start_s"]), indent=2))
        elif args.command in {"chapters", "generate-chapters"}:
            cmd_chapters(args, lecture, source_data)
        else:
            cmd_show_or_ask(args, lecture)
    except (ValueError, OSError, KeyError, sqlite3.Error) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
