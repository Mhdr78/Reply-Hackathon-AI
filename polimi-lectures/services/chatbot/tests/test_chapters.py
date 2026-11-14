import json
import unittest

from lecturemind.chapters import validate_chapters
from tests.helpers import transcript


class ValidateChaptersTest(unittest.TestCase):
    segments = transcript()["segments"]

    def answer(self, *items, fence=False):
        text = json.dumps({"chapters": [dict(title=t, start_segment_id=s) for t, s in items]})
        return f"```json\n{text}\n```" if fence else text

    def test_contiguous_chapters_from_a_fenced_answer(self):
        result = validate_chapters(self.answer(("Perceptron", "demo_00000"), ("Layers", "demo_00002"), fence=True),
                                   self.segments, 48.0)
        self.assertEqual([(c["start_s"], c["end_s"]) for c in result], [(0.0, 20.0), (20.0, 48.0)])

    def test_rejects_bad_answers(self):
        cases = {
            "not json": "The model did not return valid chapter JSON",
            self.answer(("A", "demo_00001")): "first chapter must start",
            self.answer(("A", "demo_00000"), ("B", "nope")): "unknown chapter start",
            self.answer(("A", "demo_00000"), ("B", "demo_00003"), ("C", "demo_00002")): "chronological",
            self.answer(("", "demo_00000")): "title",
        }
        for response, message in cases.items():
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                validate_chapters(response, self.segments, 48.0)
