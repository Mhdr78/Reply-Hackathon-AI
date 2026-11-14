"""End-to-end tests of the HTTP API in --fake-llm mode (a real server on a free port, temporary data)."""

import json
from http.server import ThreadingHTTPServer
from pathlib import Path
import shutil
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from lecturemind.server.http import make_handler
from lecturemind.server.service import LectureMindService
from lecturemind.server.settings import Settings
from tests.helpers import FIXTURES, needs_pdftotext


@needs_pdftotext
class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp())
        media = cls.tmp / "media"
        (media / "demo").mkdir(parents=True)
        shutil.copy(FIXTURES / "whisperx.json", media / "demo.json")  # plain WhisperX output is accepted
        shutil.copy(FIXTURES / "slides.pdf", media / "demo" / "slides.pdf")
        (media / "demo" / "materials.json").write_text(json.dumps(
            {"files": [{"file": "slides.pdf", "kind": "slides", "links": [{"start": 0, "end": 20, "page": 1}]}]}))
        settings = Settings(host="127.0.0.1", port=0, media_dir=media, data_dir=cls.tmp / "data",
                            env_file=cls.tmp / ".env", model=None, fake_llm=True, allow_origin=())
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(LectureMindService(settings)))
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}/api"
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        shutil.rmtree(cls.tmp)

    def call(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        try:
            with urlopen(Request(self.base + path, data=data, method=method)) as r:
                return r.status, (json.loads(r.read() or b"null"))
        except HTTPError as e:
            return e.code, json.loads(e.read())

    def test_lecture_is_prepared_automatically(self):
        status, info = self.call("GET", "/lectures/demo")
        self.assertEqual((status, info["prepared"], info["segments"], info["pages"]), (200, True, 5, 2))
        status, info = self.call("GET", "/lectures/unknown")
        self.assertFalse(info["prepared"])
        self.assertIn("public/media/unknown.json", info["reason"])

    def test_chat_with_selection_and_follow_up_then_delete(self):
        _, chat = self.call("POST", "/lectures/demo/chats", {})
        status, r = self.call("POST", f"/chats/{chat['id']}/messages",
                              {"content": "What is this?", "selection": {"start": 0, "end": 8}})
        self.assertEqual(status, 200)
        self.assertIn("[PDF p. 1]", r["assistant"]["content"])
        self.assertEqual(r["chat"]["title"], "What is this?")
        _, r = self.call("POST", f"/chats/{chat['id']}/messages", {"content": "More?"})
        self.assertIn("remembers 1 earlier", r["assistant"]["content"])
        _, messages = self.call("GET", f"/chats/{chat['id']}/messages")
        self.assertEqual([m["role"] for m in messages], ["user", "assistant", "user", "assistant"])
        self.assertEqual(self.call("DELETE", f"/chats/{chat['id']}")[0], 204)
        self.assertEqual(self.call("GET", f"/chats/{chat['id']}/messages")[0], 404)

    def test_errors_are_json_with_codes(self):
        _, chat = self.call("POST", "/lectures/demo/chats", {})
        self.assertEqual(self.call("POST", f"/chats/{chat['id']}/messages", {"content": " "})[1]["code"], "BAD_REQUEST")
        status, err = self.call("POST", f"/chats/{chat['id']}/messages",
                                {"content": "x", "selection": {"start": 900, "end": 901}})
        self.assertEqual((status, err["message"]), (400, "No spoken text overlaps that range."))
        self.assertEqual(self.call("GET", "/nope")[1]["code"], "NOT_FOUND")

    def test_chapters_not_generated_then_fake_generated(self):
        self.assertEqual(self.call("GET", "/lectures/demo/chapters")[1]["code"], "NOT_GENERATED")
        status, r = self.call("POST", "/lectures/demo/chapters", {})
        self.assertEqual((status, r["source"]), (200, "fake"))
        self.assertEqual(r["chapters"][0]["start"], 0.0)
