"""OpenRouter chat-completion client (standard library only)."""

import json
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .config import openrouter_credentials

ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
TIMEOUT_S = 90
HTTP_HINTS = {400: "Check the model ID and context limit.", 401: "Check the API key.",
              402: "Check available credits.", 429: "Check the model rate limit."}


def complete_messages(messages, env_file=Path(".env"), model=None, max_tokens=1200):
    """Send chat messages to OpenRouter and return the answer text. Raises ValueError on failure."""
    key, model = openrouter_credentials(env_file, model)
    body = dict(model=model, max_tokens=max_tokens, messages=messages)
    request = Request(ENDPOINT, data=json.dumps(body).encode(), headers={
        "Authorization": f"Bearer {key}", "Content-Type": "application/json",
    })
    try:
        with urlopen(request, timeout=TIMEOUT_S) as response:
            result = json.load(response)
    except HTTPError as error:
        raise ValueError(f"OpenRouter HTTP {error.code}. {HTTP_HINTS.get(error.code, '')}") from None
    except (URLError, TimeoutError):
        raise ValueError("Could not reach OpenRouter from this environment.") from None
    choices = result.get("choices") or []
    content = choices[0].get("message", {}).get("content") if choices else None
    if not content:
        raise ValueError("OpenRouter returned no answer. Check the model and context limit.")
    return content


def complete(system, payload, env_file=Path(".env"), model=None):
    """One system prompt + one JSON user message."""
    return complete_messages([
        dict(role="system", content=system),
        dict(role="user", content=json.dumps(payload, ensure_ascii=False)),
    ], env_file, model)
