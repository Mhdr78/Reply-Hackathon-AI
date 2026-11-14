import json
import unittest

from lecturemind import prompts
from lecturemind.selection import select
from tests.helpers import lecture


class BuildMessagesTest(unittest.TestCase):
    def test_single_question_sends_sources_and_question_together(self):
        messages = prompts.build_messages(lecture(), None, "What is a perceptron?")
        self.assertEqual([m["role"] for m in messages], ["system", "user"])
        self.assertIn(prompts.CITATION_FORMAT, messages[0]["content"])
        self.assertTrue(messages[0]["content"].startswith(prompts.SYSTEM_GENERAL))
        payload = json.loads(messages[1]["content"])
        self.assertEqual(payload["question"], "What is a perceptron?")
        self.assertEqual(len(payload["full_context"]["transcript_segments"]), 5)

    def test_follow_up_replays_history_after_the_sources(self):
        lec = lecture()
        history = [dict(role="user", content="Explain this", selection=dict(start_s=0, end_s=8)),
                   dict(role="assistant", content="It is ...")]
        messages = prompts.build_messages(lec, select(lec, 10, 18), "And the bias?", history)
        self.assertTrue(messages[0]["content"].startswith(prompts.SYSTEM))
        self.assertEqual([m["role"] for m in messages], ["system", "user", "assistant", "user", "assistant", "user"])
        self.assertTrue(messages[3]["content"].startswith("[About the selection 0.0-8.0 s]"))
        self.assertEqual(json.loads(messages[-1]["content"])["question"], "And the bias?")

    def test_chapter_payload_uses_page_titles(self):
        titles = [p["title"] for p in prompts.chapter_payload(lecture())["pdf_page_titles"]]
        self.assertEqual(titles, ["Perceptron", "Feed Forward Neural Networks"])
