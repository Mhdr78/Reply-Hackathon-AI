"""Command-line options and default paths of the server."""

import argparse
from dataclasses import dataclass
from pathlib import Path

CHATBOT_DIR = Path(__file__).resolve().parents[2]  # services/chatbot
REPO_DIR = CHATBOT_DIR.parents[1]
DEFAULT_MEDIA_DIR = REPO_DIR / "apps" / "web" / "public" / "media"
DEFAULT_DATA_DIR = CHATBOT_DIR / "data"


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    media_dir: Path          # the web app's public/media: transcripts and materials.json
    data_dir: Path           # server state: prepared lecture databases, chats, optional overrides
    env_file: Path
    model: str | None
    fake_llm: bool
    allow_origin: tuple

    @property
    def prepared_dir(self):
        return self.data_dir / "prepared"

    @property
    def chats_db(self):
        return self.data_dir / "chats.sqlite3"

    @property
    def overrides_file(self):
        return self.data_dir / "lectures.json"


def parse_settings(argv=None):
    parser = argparse.ArgumentParser(prog="python -m lecturemind.server",
                                     description="LectureMind HTTP API for the web app.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--media-dir", type=Path, default=DEFAULT_MEDIA_DIR,
                        help="The web app's public/media folder; lectures are prepared from it automatically")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR,
                        help="Server state: prepared/ lecture databases, chats.sqlite3, optional lectures.json")
    parser.add_argument("--env-file", type=Path, default=CHATBOT_DIR / ".env",
                        help="File with OPENROUTER_API_KEY and OPENROUTER_MODEL")
    parser.add_argument("--model", help="OpenRouter model id (overrides OPENROUTER_MODEL)")
    parser.add_argument("--fake-llm", action="store_true", help="Answer without calling OpenRouter")
    parser.add_argument("--allow-origin", nargs="*", default=["http://localhost:5173", "http://127.0.0.1:5173"],
                        help="Browser origins allowed to call the API directly (the Vite proxy needs none)")
    a = parser.parse_args(argv)
    return Settings(host=a.host, port=a.port, media_dir=a.media_dir, data_dir=a.data_dir, env_file=a.env_file,
                    model=a.model, fake_llm=a.fake_llm, allow_origin=tuple(a.allow_origin))
