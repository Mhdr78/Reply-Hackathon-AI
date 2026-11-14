"""Cached local/hosted embeddings and budgeted OpenRouter text generation."""

import json
import math
from urllib import error, request

from lecture_translation.config import read_openrouter_key
from .chunks import digest


class OpenRouter:
    def __init__(self, settings, catalog):
        self.settings, self.catalog = settings, catalog
        self.local_embeddings = None

    def _post(self, endpoint, payload, operation, estimate):
        key = read_openrouter_key()
        if not key:
            raise ValueError("Fill OPENROUTER_API_KEY in the project .env file.")
        reservation = self.catalog.reserve(operation, estimate, self.settings.budget_usd, self.settings.request_limit_usd)
        outgoing = request.Request("https://openrouter.ai/api/v1/" + endpoint,
                                   data=json.dumps(payload, ensure_ascii=False, allow_nan=False).encode(),
                                   headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, method="POST")
        try:
            with request.urlopen(outgoing, timeout=180) as response:
                result = json.load(response)
            if not isinstance(result, dict) or result.get("error"):
                raise RuntimeError("OpenRouter returned an error instead of a result.")
            self.catalog.settle(reservation, result.get("usage"))
            return result
        except error.HTTPError as failure:
            self.catalog.uncertain(reservation)
            detail = "Verify credits, model access and price/parameter availability."
            try:
                # Inspect only known routing codes. Never echo arbitrary provider
                # bodies, which may contain submitted text or sensitive metadata.
                body = json.loads(failure.read(16384))
                reasons = body.get("error", {}).get("metadata", {}).get("ineligibility_reasons", [])
                if any(isinstance(item, dict) and item.get("reason") == "model-ignored-by-guardrail" for item in reasons):
                    detail = ("The configured model is blocked by OpenRouter account guardrails. "
                              "Ask the account owner to allow it at "
                              "https://openrouter.ai/workspaces/default/guardrails, "
                              "or configure an explicitly permitted embedding/answer model.")
            except (ValueError, TypeError, AttributeError):
                pass
            raise RuntimeError(f"OpenRouter HTTP {failure.code}: {detail}") from None
        except Exception:
            self.catalog.uncertain(reservation)
            raise

    def embed(self, texts):
        result, missing = [None] * len(texts), {}
        for index, text in enumerate(texts):
            if not isinstance(text, str) or not text.strip():
                raise ValueError("Embedding inputs must be nonempty text.")
            if len(text.encode()) > 7500:
                raise ValueError("Embedding input is too large; use smaller source chunks or questions.")
            key = digest({"model": self.settings.embedding_model, "text": text,
                          "pipeline": "full-text-pooling-v1" if self.settings.embedding_model.startswith("local/") else "openrouter-v1"})
            cached = self.catalog.get_cache("embedding", key)
            if cached is not None:
                result[index] = cached
            else:
                missing.setdefault(key, {"text": text, "positions": []})["positions"].append(index)
        items = list(missing.items())
        for offset in range(0, len(items), 32):
            batch = items[offset:offset + 32]
            inputs = [item["text"] for _, item in batch]
            if self.settings.embedding_model.startswith("local/"):
                if self.local_embeddings is None:
                    from .local_embeddings import LocalEmbeddings
                    self.local_embeddings = LocalEmbeddings(self.settings)
                response = {"data": [{"index": i, "embedding": vector}
                                     for i, vector in enumerate(self.local_embeddings.embed(inputs))]}
            else:
                payload = {"model": self.settings.embedding_model, "input": inputs, "encoding_format": "float",
                           "provider": {"require_parameters": True, "max_price": {"prompt": 0.13}}}
                estimate = (sum(len(text.encode()) for text in inputs) + 4096) * 0.13 / 1_000_000
                response = self._post("embeddings", payload, "embedding", estimate)
            data = response.get("data")
            if not isinstance(data, list) or len(data) != len(batch):
                raise ValueError("Embedding response did not cover every input.")
            indexed = {}
            for item in data:
                if not isinstance(item, dict):
                    raise ValueError("Embedding response items must be objects.")
                position = item.get("index")
                vector = item.get("embedding")
                if isinstance(position, bool) or not isinstance(position, int) or not 0 <= position < len(batch) or position in indexed:
                    raise ValueError("Embedding response has invalid input indices.")
                if (not isinstance(vector, list) or not vector
                        or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in vector)
                        or sum(v * v for v in vector) == 0):
                    raise ValueError("Provider returned an invalid embedding vector.")
                indexed[position] = vector
            if len({len(v) for v in indexed.values()}) != 1:
                raise ValueError("Embedding dimensions differ within a batch.")
            for position, (key, item) in enumerate(batch):
                vector = indexed[position]
                self.catalog.put_cache("embedding", key, vector)
                for index in item["positions"]:
                    result[index] = vector
        if result and len({len(v) for v in result}) != 1:
            raise ValueError("Embedding dimensions changed; use a new model/version and reindex.")
        return result

    def structured(self, messages, schema, operation, max_tokens):
        payload = {"model": self.settings.answer_model, "messages": messages,
                   "response_format": {"type": "json_schema", "json_schema": {"name": operation, "strict": True, "schema": schema}},
                   "provider": {"require_parameters": True, "max_price": {"prompt": 0.10, "completion": 0.50}},
                   "max_completion_tokens": max_tokens, "stream": False}
        if self.settings.answer_model == "openai/gpt-6-luna":
            payload["reasoning"] = {"effort": "none"}
        estimate = ((len(json.dumps(payload, ensure_ascii=False).encode()) + 4096) * 0.10
                    + max_tokens * 0.50) / 1_000_000
        response = self._post("chat/completions", payload, operation, estimate)
        choices = response.get("choices")
        if (not isinstance(choices, list) or len(choices) != 1
                or not isinstance(choices[0], dict) or choices[0].get("finish_reason") != "stop"):
            raise ValueError("The model response was incomplete; no answer accepted.")
        message = choices[0].get("message", {})
        if not isinstance(message, dict) or message.get("refusal") or not isinstance(message.get("content"), str):
            raise ValueError("The model did not return structured evidence output.")
        value = json.loads(message["content"])
        if not isinstance(value, dict):
            raise ValueError("Expected a structured JSON object.")
        return value

