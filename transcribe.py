"""Compatibility entry point: python transcribe.py <recording> [options]."""

import sys
from pathlib import Path

# Preserve the existing command for users working directly from the checkout.
source_directory = str(Path(__file__).resolve().parent / "src")
if source_directory not in sys.path:
    sys.path.insert(0, source_directory)

from lecture_transcription import detect_lecture_language, transcribe_lecture
from lecture_transcription.cli import main

__all__ = ["detect_lecture_language", "transcribe_lecture", "main"]

if __name__ == "__main__":
    raise SystemExit(main())
