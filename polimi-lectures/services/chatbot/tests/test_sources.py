import json
import sqlite3
import tempfile
from pathlib import Path
import unittest

from lecturemind.sources import normalize_transcript, prepare_lecture, read_lecture_row
from tests.helpers import FIXTURES, needs_pdftotext, transcript


class NormalizeTranscriptTest(unittest.TestCase):
    def test_adds_unit_lecture_id_and_segment_ids(self):
        raw = json.loads((FIXTURES / "whisperx.json").read_text())
        t = normalize_transcript(raw, "ml-99")
        self.assertEqual((t["timestamp_unit"], t["lecture_id"]), ("seconds", "ml-99"))
        self.assertEqual(t["segments"][1]["segment_id"], "ml-99_00001")


@needs_pdftotext
class PrepareLectureTest(unittest.TestCase):
    def test_saves_segments_pages_with_titles_and_links_and_clears_chapters(self):
        with tempfile.TemporaryDirectory() as d:
            db = Path(d) / "lecture.sqlite3"
            reviewed = [dict(start_s=20.0, end_s=40.0, page_number=2)]
            summary = prepare_lecture(transcript(), FIXTURES / "slides.pdf", reviewed, db)
            self.assertEqual((summary["segments"], summary["pages"]), (5, 2))
            lecture = json.loads(read_lecture_row(db))
            self.assertEqual([p["title"] for p in lecture["pages"]], ["Perceptron", "Feed Forward Neural Networks"])
            self.assertIn(dict(start_s=20.0, end_s=40.0, page_number=2, match_status="reviewed_content_match"),
                          lecture["links"])
            with sqlite3.connect(db) as c:
                self.assertEqual(c.execute("SELECT COUNT(*) FROM lecture_chapters").fetchone()[0], 0)

    def test_rejects_reviewed_link_to_missing_page(self):
        with tempfile.TemporaryDirectory() as d, self.assertRaisesRegex(ValueError, "reviewed link"):
            prepare_lecture(transcript(), FIXTURES / "slides.pdf", [dict(start_s=0, end_s=5, page_number=9)],
                            Path(d) / "x.sqlite3")
