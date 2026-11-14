"""Source-checkout command: python rag.py index/search/ask/serve ..."""

import sys
from pathlib import Path

source = str(Path(__file__).resolve().parent / "src")
if source not in sys.path:
    sys.path.insert(0, source)

try:
    from lecture_rag.cli import main
except ModuleNotFoundError as failure:
    raise SystemExit("Install RAG dependencies first: python -m pip install -e '.[rag]'") from failure

if __name__ == "__main__":
    raise SystemExit(main())
