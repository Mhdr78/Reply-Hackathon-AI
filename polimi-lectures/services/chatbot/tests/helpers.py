import json
from pathlib import Path
import shutil
import unittest

FIXTURES = Path(__file__).parent / "fixtures"
HAS_PDFTOTEXT = shutil.which("pdftotext") is not None
needs_pdftotext = unittest.skipUnless(HAS_PDFTOTEXT, "Poppler (pdftotext) is not installed")


def transcript():
    return json.loads((FIXTURES / "transcript.json").read_text(encoding="utf-8"))


def lecture(links=()):
    """A prepared-lecture dict without going through the PDF (for pure-logic tests)."""
    t = transcript()
    pages = [dict(page_number=1, title="Perceptron", text="Perceptron\nstep function threshold"),
             dict(page_number=2, title="Feed Forward Neural Networks", text="Feed Forward Neural Networks\nlayers")]
    return dict(lecture_id=t["lecture_id"], pdf="slides.pdf", segments=t["segments"], pages=pages, links=list(links))
