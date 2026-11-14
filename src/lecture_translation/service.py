"""Budget-checked translation entry point for backend integrations."""

import math

from . import client
from .core import DEFAULT_MODEL, assemble_translation, build_request, estimate_request_cost


def translate_transcript(source: dict, target_language: str, model: str = DEFAULT_MODEL,
                         max_output_tokens: int = 65536, max_estimated_cost: float = 0.10,
                         timeout: float = 1800) -> dict:
    """Translate the full source once; return only a completely validated track."""
    if not math.isfinite(max_estimated_cost) or max_estimated_cost <= 0:
        raise ValueError("The estimated-cost limit must be positive.")
    if not math.isfinite(timeout) or timeout <= 0:
        raise ValueError("Timeout must be positive.")
    payload = build_request(source, target_language, model, max_output_tokens)
    estimate = estimate_request_cost(payload)
    if estimate["estimated_max_text_cost_usd"] > max_estimated_cost:
        raise ValueError(f"Estimated text cost ${estimate['estimated_max_text_cost_usd']:.6f} exceeds this request's ${max_estimated_cost:.6f} limit.")
    response = client.complete(payload, timeout=timeout)
    return assemble_translation(source, target_language, model, response)
