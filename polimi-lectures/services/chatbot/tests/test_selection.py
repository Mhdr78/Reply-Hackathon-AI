import unittest

from lecturemind.selection import select
from tests.helpers import lecture


class SelectTest(unittest.TestCase):
    def test_word_level_excerpt_and_links_reviewed_first(self):
        links = [dict(start_s=0, end_s=20, page_number=2, match_status="suggested_content_match", score=9.0),
                 dict(start_s=0, end_s=20, page_number=1, match_status="reviewed_content_match")]
        sel = select(lecture(links), 0.0, 3.0)
        self.assertEqual(sel["excerpt_parts"][0]["timing"], "word")
        self.assertTrue(sel["transcript_excerpt"].startswith("The perceptron"))
        self.assertNotIn("threshold", sel["transcript_excerpt"])  # words after 3 s are excluded
        self.assertEqual([m["page_number"] for m in sel["matched_pdf_pages"]], [1, 2])

    def test_range_without_speech_or_invalid_range_raises(self):
        with self.assertRaises(ValueError):
            select(lecture(), 500, 600)
        with self.assertRaises(ValueError):
            select(lecture(), 5, 5)
