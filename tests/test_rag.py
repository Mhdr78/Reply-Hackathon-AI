"""Real local-Qdrant integration tests with deterministic, unpaid model fixtures."""

import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

try:
    from fastapi.testclient import TestClient
    from lecture_rag import RagService, Settings, build_chunks
    from lecture_rag.api import create_app
    from lecture_rag.catalog import BudgetExceeded, Catalog
    from lecture_rag.provider import OpenRouter
    from lecture_rag.adapters import canonical_transcript, prepared_documents, frontend_answer
    from lecture_rag import provider as provider_module
except ModuleNotFoundError as failure:
    raise unittest.SkipTest("Install optional RAG tests: pip install -e '.[rag,test]'") from failure


def transcript(lecture_id="lecture_test"):
    return {"schema_version": "1.0", "lecture_id": lecture_id, "source_video": "lecture.mp4", "engine": "openai-whisper",
            "model": "small", "language": "en", "timestamp_unit": "seconds", "text": "Bias and activation functions.",
            "segments": [
                {"segment_id": "s0", "start": 10.0, "end": 20.0, "text": "The perceptron matrix has I+1 columns because the extra input is a constant for the bias.", "words": []},
                {"segment_id": "s1", "start": 80.0, "end": 90.0, "text": "ReLU is an activation function in neural networks.", "words": []},
            ]}


def documents():
    return [{"document_id": "slides", "name": "slides.pdf", "pages": [
        {"page_number": 17, "title": "Feed Forward Neural Networks", "text": "The bias is the weight attached to a constant input in the perceptron matrix."},
        {"page_number": 18, "title": "Activation functions", "text": "ReLU, sigmoid and tanh are activation functions."},
        {"page_number": 19, "title": "Figure only", "text": ""},
    ]}]


class FakeProvider:
    def __init__(self):
        self.embedding_calls = 0
        self.chat_calls = []
        self.bad_citation = False

    def embed(self, texts):
        self.embedding_calls += 1
        vectors = []
        for text in texts:
            lower = text.lower()
            vectors.append([0.1,
                            float(any(x in lower for x in ["bias", "matrix", "matrice", "colonne", "columns", "i+1"])),
                            float(any(x in lower for x in ["relu", "activation", "attivazione"])),
                            float("photosynthesis" in lower)])
        return vectors

    def structured(self, messages, schema, operation, max_tokens):
        self.chat_calls.append(operation)
        data = json.loads(messages[1]["content"])
        if operation == "rag_rerank":
            sufficient = "photosynthesis" not in data["question"].lower()
            return {"ranked_chunk_ids": [c["chunk_id"] for c in data["candidates"][:5]] if sufficient else [],
                    "sufficient_evidence": sufficient}
        italian = "entirely in Italian" in messages[0]["content"]
        return {"status": "answered", "paragraphs": [{"text": "La colonna aggiuntiva rappresenta il bias." if italian else "The extra column represents the bias.",
                                                       "source_ids": ["S999" if self.bad_citation else data["evidence"][0]["citation_id"]]}]}


class RagIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.settings = Settings(data_dir=Path(self.temporary.name))
        self.provider = FakeProvider()
        self.rag = RagService(self.settings, provider=self.provider)

    def tearDown(self):
        self.rag.close()
        self.temporary.cleanup()

    def test_index_reuse_preserves_page_and_time_metadata(self):
        source = transcript()
        original = copy.deepcopy(source)
        first = self.rag.index_lecture(source, documents())
        second = self.rag.index_lecture(source, documents())
        self.assertFalse(first["reused"])
        self.assertTrue(second["reused"])
        self.assertEqual(self.provider.embedding_calls, 1)
        self.assertEqual(first["empty_pdf_pages"], [{"document_id": "slides", "page_number": 19}])
        result = self.rag.search("lecture_test", "bias matrix", rerank=False)
        self.assertTrue(any(c["source_type"] == "pdf" and c["page_number"] == 17 for c in result["hits"]))
        self.assertTrue(any(c.get("start_s") == 10 and c.get("end_s") == 90 for c in result["hits"]))
        self.assertEqual(source, original)

    def test_scope_filter_keeps_other_courses_and_lectures_out(self):
        self.rag.index_lecture(transcript(), documents(), "course_a")
        self.rag.index_lecture(transcript("other_lecture"), documents(), "course_a")
        self.rag.index_lecture(transcript(), documents(), "course_b")
        result = self.rag.search("lecture_test", "bias", course_id="course_a", rerank=False)
        self.assertTrue(result["hits"])
        self.assertTrue(all(c["course_id"] == "course_a" and c["lecture_id"] == "lecture_test" for c in result["hits"]))

    def test_updated_sources_replace_active_version(self):
        first = self.rag.index_lecture(transcript(), documents())
        source = transcript()
        source["segments"][0]["text"] = "The updated lecture explains a corrected bias parameter."
        second = self.rag.index_lecture(source, documents())
        self.assertNotEqual(first["version"], second["version"])
        result = self.rag.search("lecture_test", "bias", rerank=False)
        self.assertTrue(all(c["version"] == second["version"] for c in result["hits"]))

    def test_failed_reindex_does_not_activate_partial_vectors(self):
        first = self.rag.index_lecture(transcript(), documents())
        source = transcript()
        source["segments"][0]["text"] = "New unfinished version of the lecture."
        original_upsert = self.rag.store.upsert

        def partial(chunks, vectors):
            original_upsert(chunks, vectors)
            raise RuntimeError("Simulated upload failure after staging vectors")

        with patch.object(self.rag.store, "upsert", side_effect=partial), self.assertRaises(RuntimeError):
            self.rag.index_lecture(source, documents())
        result = self.rag.search("lecture_test", "bias", rerank=False)
        self.assertEqual(result["version"], first["version"])
        self.assertTrue(all(c["version"] == first["version"] for c in result["hits"]))

    def test_selected_range_and_italian_answer_keep_source_citations(self):
        self.rag.index_lecture(transcript(), documents())
        result = self.rag.ask("lecture_test", "Perché la matrice ha I+1 colonne?", response_language="it",
                              selection={"start_s": 11, "end_s": 15})
        self.assertEqual(result["status"], "answered")
        self.assertEqual(result["response_language"], "it")
        self.assertIn("[S1]", result["answer"])
        for source in result["sources"]:
            self.assertIn(source["source_type"], {"pdf", "transcript"})
            if source["source_type"] == "transcript":
                self.assertIn(source["start_s"], [10.0])
        before = len(self.provider.chat_calls)
        again = self.rag.ask("lecture_test", "Perché la matrice ha I+1 colonne?", response_language="it",
                             selection={"start_s": 11, "end_s": 15})
        self.assertTrue(again["cached"])
        self.assertEqual(len(self.provider.chat_calls), before)

    def test_unanswerable_question_returns_no_fabricated_sources(self):
        self.rag.index_lecture(transcript(), documents())
        result = self.rag.ask("lecture_test", "What does this class say about photosynthesis?")
        self.assertEqual(result["status"], "insufficient_evidence")
        self.assertEqual(result["sources"], [])
        self.assertNotIn("rag_answer", self.provider.chat_calls)

    def test_word_selection_uses_real_times_and_falls_back_for_malformed_words(self):
        from lecture_rag.retrieval import selection_chunk
        from lecture_rag.chunks import scope_id
        source = transcript()
        source["segments"][0]["words"] = [
            {"word": "The", "start": 10.0, "end": 10.4},
            {"word": "bias", "start": 10.5, "end": 11.0}]
        self.rag.index_lecture(source)
        manifest = self.rag.catalog.manifest(scope_id("default", "lecture_test"))
        selected = selection_chunk(manifest, 10.6, 10.9)
        self.assertEqual((selected["text"], selected["start"], selected["end"]), ("bias", 10.5, 11.0))
        manifest["source_segments"][0]["words"] = [{"text": "bias", "start": -2, "end": True}]
        selected = selection_chunk(manifest, 10.6, 10.9)
        self.assertEqual((selected["start"], selected["end"]), (10, 20))

    def test_unknown_model_citation_is_rejected(self):
        self.rag.index_lecture(transcript(), documents())
        self.provider.bad_citation = True
        with self.assertRaisesRegex(ValueError, "citations"):
            self.rag.ask("lecture_test", "Explain bias")

    def test_local_qdrant_survives_process_lifecycle(self):
        self.rag.index_lecture(transcript(), documents())
        self.rag.close()
        self.rag = RagService(self.settings, provider=self.provider)
        result = self.rag.search("lecture_test", "bias", rerank=False)
        self.assertTrue(result["hits"])

    def test_http_contract_and_selection_validation(self):
        with TestClient(create_app(self.rag)) as client:
            result = client.post("/rag/index", json={"transcript": transcript(), "documents": documents()})
            self.assertEqual(result.status_code, 200, result.text)
            answer = client.post("/rag/ask", json={"lecture_id": "lecture_test", "question": "Explain bias", "response_language": "it"})
            self.assertEqual(answer.status_code, 200, answer.text)
            self.assertTrue(answer.json()["sources"])
            invalid = client.post("/rag/search", json={"lecture_id": "lecture_test", "question": "bias", "selection": {"start_s": 20, "end_s": 10}})
            self.assertEqual(invalid.status_code, 422)
            self.assertEqual(client.get("/health").status_code, 200)


class RagBudgetAndEmbeddingTests(unittest.TestCase):
    def test_provider_guardrail_failure_is_actionable_without_exposing_response(self):
        with tempfile.TemporaryDirectory() as directory:
            settings = Settings(data_dir=Path(directory), embedding_model="openai/text-embedding-3-large")
            catalog = Catalog(Path(directory) / "catalog.db")
            provider = OpenRouter(settings, catalog)
            body = {"error": {"message": "sensitive-provider-body", "metadata": {
                "ineligibility_reasons": [{"reason": "model-ignored-by-guardrail"}]}}}
            failure = HTTPError("https://openrouter.ai/api/v1/embeddings", 404, "Not found", {},
                                io.BytesIO(json.dumps(body).encode()))
            with patch.object(provider_module, "read_openrouter_key", return_value="test-key"), \
                    patch.object(provider_module.request, "urlopen", side_effect=failure):
                with self.assertRaisesRegex(RuntimeError, "account guardrails") as caught:
                    provider.embed(["bias input"])
            self.assertNotIn("sensitive-provider-body", str(caught.exception))
            self.assertGreater(catalog.status()["used_or_reserved_usd"], 0)

    def test_teammate_data_bridge_preserves_sources_and_legacy_citations(self):
        raw = {"language": "en", "segments": [
            {"start": 331.6, "end": 340, "text": "The constant input represents bias."}]}
        before = copy.deepcopy(raw)
        source = canonical_transcript(raw, lecture_id="ml-01", source_video="ml-01.mp4")
        self.assertEqual(source["segments"][0]["segment_id"], "ml-01_00000")
        prepared = {"pdf": "slides.pdf", "pages": documents()[0]["pages"]}
        bundle = build_chunks(source, prepared_documents(prepared), "machine_learning")
        self.assertEqual(bundle["lecture_id"], "ml-01")
        self.assertEqual(raw, before)
        missing_language = copy.deepcopy(raw)
        del missing_language["language"]
        with self.assertRaisesRegex(ValueError, "language"):
            canonical_transcript(missing_language, lecture_id="ml-01", source_video="ml-01.mp4")
        rendered = frontend_answer({"status": "answered", "paragraphs": [
            {"text": "Il bias usa un ingresso costante.", "source_ids": ["S1", "S2"]}], "sources": [
            {"citation_id": "S1", "source_type": "transcript", "start_s": 331.6},
            {"citation_id": "S2", "source_type": "pdf", "page_number": 17}]})
        self.assertEqual(rendered, "Il bias usa un ingresso costante. [5:31] [PDF p. 17]")

    def test_budget_reservations_are_atomic_and_failed_calls_remain_counted(self):
        with tempfile.TemporaryDirectory() as directory:
            catalog = Catalog(Path(directory) / "catalog.db")
            first = catalog.reserve("test", 0.02, 0.03, 0.03)
            catalog.uncertain(first)
            with self.assertRaises(BudgetExceeded):
                catalog.reserve("test", 0.02, 0.03, 0.03)
            catalog.settle(first, {"cost": 0.001})
            catalog.reserve("test", 0.02, 0.03, 0.03)
            self.assertAlmostEqual(catalog.status()["used_or_reserved_usd"], 0.021)

    def test_embedding_cache_deduplicates_inputs_and_future_calls(self):
        with tempfile.TemporaryDirectory() as directory:
            settings = Settings(data_dir=Path(directory), embedding_model="openai/text-embedding-3-large")
            catalog = Catalog(Path(directory) / "catalog.db")
            provider = OpenRouter(settings, catalog)
            response = {"data": [{"index": 1, "embedding": [0.0, 1.0]}, {"index": 0, "embedding": [1.0, 0.0]}], "usage": {"cost": 0.0001}}
            with patch.object(provider_module, "read_openrouter_key", return_value="test-not-a-real-key"), patch.object(provider_module.request, "urlopen") as network:
                network.return_value.__enter__.return_value.read.return_value = json.dumps(response).encode()
                vectors = provider.embed(["bias", "bias", "relu"])
                self.assertEqual(vectors, [[1.0, 0.0], [1.0, 0.0], [0.0, 1.0]])
                self.assertEqual(provider.embed(["relu", "bias"]), [[0.0, 1.0], [1.0, 0.0]])
                self.assertEqual(network.call_count, 1)
            self.assertEqual(catalog.status()["paid_requests_recorded"], 1)

    def test_local_embeddings_are_cached_without_network_or_key(self):
        with tempfile.TemporaryDirectory() as directory:
            settings = Settings(data_dir=Path(directory))
            catalog = Catalog(Path(directory) / "catalog.db")
            provider = OpenRouter(settings, catalog)
            with patch("lecture_rag.local_embeddings.LocalEmbeddings") as local, \
                    patch.object(provider_module, "read_openrouter_key", side_effect=AssertionError("No key needed")), \
                    patch.object(provider_module.request, "urlopen", side_effect=AssertionError("No inference API needed")):
                local.return_value.embed.return_value = [[1.0, 0.0]]
                self.assertEqual(provider.embed(["bias", "bias"]), [[1.0, 0.0], [1.0, 0.0]])
                self.assertEqual(provider.embed(["bias"]), [[1.0, 0.0]])
                self.assertEqual(local.return_value.embed.call_count, 1)
            self.assertEqual(catalog.status()["paid_requests_recorded"], 0)

    def test_local_embedding_pooling_covers_the_tail_of_long_inputs(self):
        from types import SimpleNamespace
        from lecture_rag.local_embeddings import LocalEmbeddings

        def encode(text):
            return SimpleNamespace(overflowing=[True] if len(text) > 40 else [], ids=list(range(len(text) + 2)))

        def embed(parts, batch_size):
            self.assertTrue(all(len(p) <= 40 for p in parts))
            return [[1.0, float("tail" in p)] for p in parts]

        local = LocalEmbeddings.__new__(LocalEmbeddings)
        local.model = SimpleNamespace(model=SimpleNamespace(tokenizer=SimpleNamespace(encode=encode)), embed=embed)
        vector = local.embed(["word " * 300 + "tail"])[0]
        self.assertGreater(vector[1], 0)
        self.assertAlmostEqual(sum(v*v for v in vector), 1)

    def test_chunk_inputs_are_bounded_and_originals_are_not_mutated(self):
        source = transcript()
        source["segments"][0]["text"] = "Neural networks and bias. " * 1000
        before = copy.deepcopy(source)
        bundle = build_chunks(source, documents())
        self.assertTrue(all(len(c["text"].encode()) <= 2400 for c in bundle["chunks"]))
        self.assertEqual(source, before)
        self.assertEqual(len({c["chunk_id"] for c in bundle["chunks"]}), len(bundle["chunks"]))


if __name__ == "__main__":
    unittest.main()
