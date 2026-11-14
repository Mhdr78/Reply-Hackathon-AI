"""Command-line interface for lecture transcription."""

import argparse
import json
import re
import subprocess
from pathlib import Path

from .core import transcribe_lecture
import whisper


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcribe English/Italian lectures into timestamped JSON.")
    parser.add_argument("video", type=Path, help="Path to a lecture video or audio file")
    parser.add_argument("--lecture-id", help="Shared lecture ID used by your team")
    parser.add_argument(
        "--language", choices=["auto", "en", "it"], default="auto",
        help="Default: automatically choose English or Italian; optionally force en or it",
    )
    parser.add_argument("--model", default="small", choices=whisper.available_models())
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"])
    parser.add_argument("--output-dir", type=Path, default=Path("outputs"))
    parser.add_argument("--overwrite", action="store_true", help="Replace existing output")
    args = parser.parse_args()

    lecture_id = args.lecture_id or re.sub(r"[^A-Za-z0-9_-]+", "_", args.video.stem)
    if not re.fullmatch(r"[A-Za-z0-9_-]+", lecture_id):
        parser.error("Lecture ID must use letters, numbers, underscores or hyphens.")
    destination = args.output_dir.expanduser() / lecture_id
    json_path = destination / "transcript.json"
    text_path = destination / "transcript.txt"
    if not args.overwrite and (json_path.exists() or text_path.exists()):
        parser.error(f"Output already exists in {destination}. Use --overwrite to replace it.")

    try:
        transcript = transcribe_lecture(
            args.video, lecture_id, args.model, args.language, args.device
        )
        destination.mkdir(parents=True, exist_ok=True)
        json_path.write_text(
            json.dumps(transcript, ensure_ascii=False, indent=2, allow_nan=False) + "\n",
            encoding="utf-8",
        )
        text_path.write_text(transcript["text"] + "\n", encoding="utf-8")
    except (OSError, RuntimeError, ValueError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Transcription failed: {error}\n")

    print(f"JSON: {json_path.resolve()}")
    print(f"Text: {text_path.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
