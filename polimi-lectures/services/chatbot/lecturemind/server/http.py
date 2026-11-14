"""HTTP layer: routing, JSON bodies, CORS and error mapping. All logic lives in LectureMindService.

Endpoints (JSON):
    GET    /api/health
    GET    /api/lectures/<lecture_id>             -> {lecture_id, prepared, pdf, segments, pages} or {prepared: false, reason}
    GET    /api/lectures/<lecture_id>/chapters    -> chapters (404 NOT_GENERATED if not generated yet)
    POST   /api/lectures/<lecture_id>/chapters    {force?} -> chapters (generated with the LLM and saved)
    GET    /api/lectures/<lecture_id>/chats       -> [chat]
    POST   /api/lectures/<lecture_id>/chats       {title?} -> chat
    GET    /api/chats/<chat_id>/messages          -> [message]
    POST   /api/chats/<chat_id>/messages          {content, selection?: {start, end}} -> {chat, user, assistant}
    PATCH  /api/chats/<chat_id>                   {title} -> chat
    DELETE /api/chats/<chat_id>                   -> 204
Errors: {"code": ..., "message": ...} with a 4xx/5xx status.
"""

from http.server import BaseHTTPRequestHandler
import json
import re
import sys

from .errors import ApiError

MAX_BODY_BYTES = 64_000
LECTURE = r"([\w.-]+)"
CHAT = r"(\w+)"


def build_routes(service):
    s = service
    return [
        ("GET", r"/api/health", lambda body: (200, dict(
            ok=True, fake_llm=s.settings.fake_llm, manual_lectures=sorted(s.lectures.overrides),
            media_dir=str(s.lectures.media_dir) if s.lectures.media_dir else None))),
        ("GET", rf"/api/lectures/{LECTURE}", lambda body, lid: (200, s.lecture_status(lid))),
        ("GET", rf"/api/lectures/{LECTURE}/chapters", lambda body, lid: (200, s.get_chapters(lid))),
        ("POST", rf"/api/lectures/{LECTURE}/chapters",
         lambda body, lid: (200, s.generate_chapters(lid, force=bool(body().get("force"))))),
        ("GET", rf"/api/lectures/{LECTURE}/chats", lambda body, lid: (200, s.chats.list_chats(lid))),
        ("POST", rf"/api/lectures/{LECTURE}/chats", lambda body, lid: (201, s.create_chat(lid, body().get("title")))),
        ("GET", rf"/api/chats/{CHAT}/messages", lambda body, cid: (200, s.chats.messages(cid))),
        ("POST", rf"/api/chats/{CHAT}/messages",
         lambda body, cid: (200, s.ask(cid, (b := body()).get("content"), b.get("selection")))),
        ("PATCH", rf"/api/chats/{CHAT}", lambda body, cid: (200, s.rename_chat(cid, body().get("title")))),
        ("DELETE", rf"/api/chats/{CHAT}", lambda body, cid: (s.chats.delete_chat(cid), (204, None))[1]),
    ]


def make_handler(service):
    routes = [(method, re.compile(pattern), fn) for method, pattern, fn in build_routes(service)]
    allowed_origins = set(service.settings.allow_origin)

    class Handler(BaseHTTPRequestHandler):
        server_version = "LectureMind/1.0"

        def log_message(self, fmt, *args):  # concise access log, never bodies
            sys.stderr.write(f"{self.command} {self.path} -> {args[1] if len(args) > 1 else ''}\n")

        def _cors(self):
            origin = self.headers.get("Origin")
            if origin and origin in allowed_origins:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

        def _reply(self, status, data=None):
            body = b"" if data is None else json.dumps(data, ensure_ascii=False).encode()
            self.send_response(status)
            self._cors()
            if data is not None:
                self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _body(self):
            length = int(self.headers.get("Content-Length") or 0)
            if length > MAX_BODY_BYTES:
                raise ApiError(413, "BAD_REQUEST", "Request too large.")
            if not length:
                return {}
            try:
                data = json.loads(self.rfile.read(length))
            except json.JSONDecodeError:
                raise ApiError(400, "BAD_REQUEST", "Body must be JSON.") from None
            if not isinstance(data, dict):
                raise ApiError(400, "BAD_REQUEST", "Body must be a JSON object.")
            return data

        def do_OPTIONS(self):
            self._reply(204)

        def _dispatch(self):
            path = self.path.split("?", 1)[0].rstrip("/")
            try:
                for method, pattern, handler in routes:
                    m = pattern.fullmatch(path)
                    if m and method == self.command:
                        status, data = handler(self._body, *m.groups())
                        return self._reply(status, data)
                raise ApiError(404, "NOT_FOUND", "No such endpoint.")
            except ApiError as e:
                self._reply(e.status, dict(code=e.code, message=e.message))
            except Exception as e:  # noqa: BLE001 - last-resort handler, keeps the server alive
                sys.stderr.write(f"Internal error: {e!r}\n")
                self._reply(500, dict(code="UNKNOWN", message="Internal server error."))

        do_GET = do_POST = do_PATCH = do_DELETE = _dispatch

    return Handler
