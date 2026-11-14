"""Backward-compatible entry point: `python lecture_cli.py ...` is the same as `python -m lecturemind.cli ...`."""

import sys

from lecturemind.cli import main

if __name__ == "__main__":
    sys.exit(main())
