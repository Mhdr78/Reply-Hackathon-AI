"""Translation integrity checks; API responses are simulated, not translations."""

import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from lecture_translation import cli, client
from lecture_translation.core import DEFAULT_MODEL, assemble_translation, build_request, cache_matches, estimate_request_cost


def source_fixture():
    return {
        "schema_version": "1.0", "lecture_id": "lecture_001", "source_video": "lecture.mp4",
        "engine": "openai-whisper", "model": "small", "language": "en", "timestamp_unit": "seconds",
        "text": "The learning rate controls each update. A large value can overshoot.",
        "segments": [
            {"segment_id": "s0", "start": 1.0, "end": 3.2, "text": "The learning rate controls",
             "words": [{"word": "learning", "start": 1.1, "end": 1.5, "probability": 0.9}]},
            {"segment_id": "s1", "start": 3.2, "end": 4.8, "text": "each update.", "words": []},
            {"segment_id": "s2", "start": 6.0, "end": 9.0, "text": "A large value can overshoot.", "words": []},
        ],
    }


def response_fixture(units=None, finish="stop"):
    if units is None:
        units = [
            {"source_segment_ids": ["s0", "s1"], "text": "Il tasso di apprendimento controlla ogni aggiornamento."},
            {"source_segment_ids": ["s2"], "text": "Un valore elevato può oltrepassare l'obiettivo."},
        ]
    return {"id": "test-response", "model": DEFAULT_MODEL, "usage": {"prompt_tokens": 100, "completion_tokens": 50},
            "choices": [{"finish_reason": finish, "message": {"content": json.dumps({"units": units})}}]}


class TranslationIntegrityTests(unittest.TestCase):
    def test_request_contains_whole_lecture_once_without_alignment_bloat(self):
        source = source_fixture()
        before = copy.deepcopy(source)
        request = build_request(source, "it")
        data = json.loads(request["messages"][1]["content"])
        self.assertEqual(data["segments"], [{"id": s["segment_id"], "text": s["text"]} for s in source["segments"]])
        self.assertTrue(request["provider"]["require_parameters"])
        self.assertEqual(request["provider"]["max_price"], {"prompt": 0.10, "completion": 0.50})
        self.assertEqual(request["response_format"]["type"], "json_schema")
        self.assertEqual(source, before)

    def test_complete_sentences_can_merge_adjacent_source_fragments(self):
        source = source_fixture()
        result = assemble_translation(source, "it", DEFAULT_MODEL, response_fixture())
        self.assertEqual(len(result["segments"]), 2)
        first = result["segments"][0]
        self.assertEqual((first["start"], first["end"]), (1.0, 4.8))
        self.assertEqual(first["source_segment_ids"], ["s0", "s1"])
        self.assertEqual(first["words"], [])
        self.assertEqual(result["source_language"], "en")
        self.assertEqual(result["language"], "it")
        self.assertEqual(result["text"], "\n\n".join(s["text"] for s in result["segments"]))

    def test_missing_duplicated_and_reordered_source_ids_are_rejected(self):
        for groups in [[["s0"], ["s2"]], [["s0", "s0", "s1", "s2"]], [["s1", "s0", "s2"]]]:
            with self.subTest(groups=groups):
                units = [{"source_segment_ids": ids, "text": "Traduzione"} for ids in groups]
                with self.assertRaisesRegex(ValueError, "coverage failed"):
                    assemble_translation(source_fixture(), "it", DEFAULT_MODEL, response_fixture(units))

    def test_truncated_response_is_not_accepted_even_if_its_json_is_valid(self):
        with self.assertRaisesRegex(ValueError, "did not finish"):
            assemble_translation(source_fixture(), "it", DEFAULT_MODEL, response_fixture(finish="length"))

    def test_invalid_source_time_and_same_language_fail_before_api(self):
        for value in [float("nan"), True, -1]:
            source = source_fixture()
            source["segments"][0]["start"] = value
            with self.subTest(value=value), self.assertRaises(ValueError):
                build_request(source, "it")
        with self.assertRaisesRegex(ValueError, "already uses"):
            build_request(source_fixture(), "en")

    def test_empty_translation_for_spoken_content_is_rejected(self):
        units = [{"source_segment_ids": ["s0", "s1", "s2"], "text": ""}]
        with self.assertRaisesRegex(ValueError, "empty translation"):
            assemble_translation(source_fixture(), "it", DEFAULT_MODEL, response_fixture(units))

    def test_cache_rejects_changed_source_or_tampered_timing(self):
        source = source_fixture()
        saved = assemble_translation(source, "it", DEFAULT_MODEL, response_fixture())
        self.assertTrue(cache_matches(source, saved, "it", DEFAULT_MODEL))
        saved["segments"][0]["start"] = 10
        self.assertFalse(cache_matches(source, saved, "it", DEFAULT_MODEL))

    def test_cost_estimate_includes_full_output_cap(self):
        request = build_request(source_fixture(), "it", max_output_tokens=10000)
        estimate = estimate_request_cost(request)
        self.assertEqual(estimate["max_output_tokens"], 10000)
        self.assertGreaterEqual(estimate["estimated_max_text_cost_usd"], 0.005)


class TranslationCommandTests(unittest.TestCase):
    def test_writes_parallel_track_and_reuses_it_without_another_api_call(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "transcript.json"
            source.write_text(json.dumps(source_fixture()), encoding="utf-8")
            original = source.read_bytes()
            args = ["translate.py", str(source), "--target-language", "it"]
            with patch("sys.argv", args), patch.object(cli.client, "complete", return_value=response_fixture()) as api:
                self.assertEqual(cli.main(), 0)
                self.assertEqual(cli.main(), 0)
                self.assertEqual(api.call_count, 1)
            self.assertEqual(source.read_bytes(), original)
            translated = json.loads((root / "translations/it/transcript.json").read_text())
            self.assertEqual(translated["language"], "it")
            self.assertEqual((root / "translations/it/transcript.txt").read_text().strip(), translated["text"])

    def test_prepare_only_is_not_a_completed_translation_and_never_calls_api(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "transcript.json"
            source.write_text(json.dumps(source_fixture()), encoding="utf-8")
            with patch("sys.argv", ["translate.py", str(source), "--target-language", "it", "--prepare-only"]), patch.object(cli.client, "complete") as api:
                self.assertEqual(cli.main(), 0)
                api.assert_not_called()
            self.assertTrue((root / "translations/it/translation_request.json").exists())
            self.assertFalse((root / "translations/it/transcript.json").exists())

    def test_budget_guard_and_incomplete_output_never_publish_translation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "transcript.json"
            source.write_text(json.dumps(source_fixture()), encoding="utf-8")
            base = ["translate.py", str(source), "--target-language", "it"]
            with patch("sys.argv", base + ["--max-estimated-cost", "0.000001"]), patch.object(cli.client, "complete") as api:
                with self.assertRaises(SystemExit) as failure:
                    cli.main()
                self.assertEqual(failure.exception.code, 1)
                api.assert_not_called()
            with patch("sys.argv", base), patch.object(cli.client, "complete", return_value=response_fixture(finish="length")):
                with self.assertRaises(SystemExit):
                    cli.main()
            self.assertFalse((root / "translations/it/transcript.json").exists())


class OpenRouterClientTests(unittest.TestCase):
    def test_missing_key_stops_before_network(self):
        with patch.object(client, "read_openrouter_key", return_value=""), patch.object(client.request, "urlopen") as network:
            with self.assertRaisesRegex(RuntimeError, "OPENROUTER_API_KEY"):
                client.complete({})
            network.assert_not_called()

    def test_http_adapter_posts_json_to_openrouter(self):
        response = response_fixture()
        payload = build_request(source_fixture(), "it")
        with patch.object(client, "read_openrouter_key", return_value="test-only-not-a-real-key"), patch.object(client.request, "urlopen") as network:
            network.return_value.__enter__.return_value.read.return_value = json.dumps(response).encode()
            self.assertEqual(client.complete(payload), response)
            outgoing = network.call_args.args[0]
            self.assertEqual(outgoing.full_url, "https://openrouter.ai/api/v1/chat/completions")
            self.assertEqual(json.loads(outgoing.data), payload)
            self.assertEqual(outgoing.get_header("Authorization"), "Bearer test-only-not-a-real-key")


if __name__ == "__main__":
    unittest.main()
