"""Small OpenRouter HTTP adapter; no Whisper model or SDK dependency."""

import json
from urllib import error, request

from .config import read_openrouter_key

ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"


def complete(payload: dict, timeout: float = 1800) -> dict:
    api_key = read_openrouter_key()
    if not api_key:
        raise RuntimeError("Set OPENROUTER_API_KEY in the project's .env file before translating.")
    body = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8")
    outgoing = request.Request(
        ENDPOINT,
        data=body,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    # No automatic retry: a timed-out request may already have incurred cost.
    try:
        with request.urlopen(outgoing, timeout=timeout) as incoming:
            result = json.load(incoming)
    except error.HTTPError as failure:
        raise RuntimeError(f"OpenRouter HTTP {failure.code}; check model access, credits, and provider parameter support.") from None
    except (error.URLError, TimeoutError) as failure:
        raise RuntimeError("OpenRouter connection failed or timed out; inspect the request before retrying.") from failure
    except (json.JSONDecodeError, UnicodeError) as failure:
        raise RuntimeError("OpenRouter returned an unreadable response.") from failure
    if not isinstance(result, dict):
        raise RuntimeError("OpenRouter returned an unexpected response shape.")
    return result
