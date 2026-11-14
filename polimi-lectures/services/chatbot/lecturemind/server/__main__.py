"""python -m lecturemind.server [--fake-llm] [--port 8787] ..."""

from http.server import ThreadingHTTPServer
import sys

from .http import make_handler
from .service import LectureMindService
from .settings import parse_settings


def main(argv=None):
    settings = parse_settings(argv)
    service = LectureMindService(settings)
    if not service.lectures.media_dir:
        print(f"Warning: media folder {settings.media_dir} not found; only lectures in {settings.overrides_file} "
              "can be answered. Pass --media-dir /path/to/apps/web/public/media.", file=sys.stderr)
    server = ThreadingHTTPServer((settings.host, settings.port), make_handler(service))
    mode = "fake LLM" if settings.fake_llm else "OpenRouter"
    print(f"LectureMind API on http://{settings.host}:{settings.port} ({mode}); "
          f"lectures prepared automatically from {service.lectures.media_dir or '(no media folder)'}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
