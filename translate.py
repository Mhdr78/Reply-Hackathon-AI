"""Run from the checkout: python translate.py <transcript.json> --target-language it."""

import sys
from pathlib import Path

source_directory = str(Path(__file__).resolve().parent / "src")
if source_directory not in sys.path:
    sys.path.insert(0, source_directory)

from lecture_translation.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
