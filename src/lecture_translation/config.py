"""Read the local OpenRouter key without modifying the process environment."""

import os
from pathlib import Path

from dotenv import dotenv_values


def default_env_file() -> Path:
    checkout = Path(__file__).resolve().parents[2]
    if (checkout / "pyproject.toml").is_file() and (checkout / "src/lecture_translation").is_dir():
        return checkout / ".env"
    # Installed wheels can use a .env in the caller's working directory.
    return Path.cwd() / ".env"


def read_openrouter_key(env_file: str | Path | None = None) -> str:
    path = Path(env_file).expanduser() if env_file is not None else default_env_file()
    file_key = ""
    if path.exists():
        try:
            # Keep literal characters in credentials; never expand ${...}.
            file_key = (dotenv_values(path, interpolate=False).get("OPENROUTER_API_KEY") or "").strip()
        except (OSError, UnicodeError) as failure:
            raise RuntimeError("Cannot read the project's .env file; check its permissions and UTF-8 encoding.") from failure
    # A filled local file wins, so editing it takes effect on the next call.
    # Environment variables remain a fallback for deployed services.
    return file_key or os.environ.get("OPENROUTER_API_KEY", "").strip()
