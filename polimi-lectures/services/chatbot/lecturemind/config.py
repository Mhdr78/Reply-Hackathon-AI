"""Settings read from the environment or a .env file (never executed, only parsed)."""

import os
from pathlib import Path
import re

SETTING_KEYS = {"OPENROUTER_API_KEY", "OPENROUTER_MODEL"}


def read_env(path):
    """Read KEY=VALUE settings without executing the .env file."""
    settings = {}
    if path.is_file():
        for line in path.read_text(encoding="utf-8").splitlines():
            key, separator, value = line.strip().removeprefix("export ").partition("=")
            if separator and key.strip() in SETTING_KEYS:
                value = value.strip()
                if value[:1] in {"'", '"'}:
                    value = value[1:].partition(value[0])[0]
                else:
                    value = re.split(r"\s+#", value, maxsplit=1)[0]
                settings[key.strip()] = value
    return settings


def openrouter_credentials(env_file=Path(".env"), model=None):
    """(api key, model). Exported environment variables take precedence over the file. Raises ValueError if missing."""
    settings = read_env(env_file)
    key = os.environ.get("OPENROUTER_API_KEY") or settings.get("OPENROUTER_API_KEY")
    model = model or os.environ.get("OPENROUTER_MODEL") or settings.get("OPENROUTER_MODEL")
    if not key:
        raise ValueError("Set OPENROUTER_API_KEY or supply its .env path with --env-file.")
    if not model:
        raise ValueError("Set OPENROUTER_MODEL or pass --model with an OpenRouter model ID.")
    return key, model
