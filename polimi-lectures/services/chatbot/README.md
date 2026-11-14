# LectureMind (chatbot service)

Answers students' questions about a lecture using its transcript and slide deck, through OpenRouter.
It also generates the lecture chapters. Python 3.10+, standard library only. It needs Poppler's `pdftotext` on `PATH`
(`brew install poppler` on macOS, `sudo apt install poppler-utils` on Debian/Ubuntu).

```bash
cp .env.example .env                 # set OPENROUTER_API_KEY and OPENROUTER_MODEL
python -m lecturemind.server         # HTTP API on http://127.0.0.1:8787 (used by apps/web)
python -m lecturemind.server --fake-llm   # same API, canned answers, no OpenRouter calls
python -m unittest discover -s tests -t .
```

Or install it (`pip install -e .`) to get the `lecturemind` and `lecturemind-server` commands.

## Package layout

```
lecturemind/
  config.py       .env parsing, OpenRouter credentials
  llm.py          OpenRouter chat-completion client
  sources.py      lecture preparation: PDF text (pdftotext), transcript↔slide matching, the lecture database
  selection.py    spoken words and linked slides inside a selected time range
  prompts.py      system prompts and request payloads
  chapters.py     LLM chapter generation, validation, storage
  cli.py          command line (lecture_cli.py is a compatibility wrapper)
  server/
    settings.py   options and default paths
    registry.py   finds or automatically prepares a lecture's database
    chats.py      persistent chats and messages (SQLite)
    service.py    use cases: lecture status, chapters, answering
    fake.py       --fake-llm answers and chapters
    http.py       routing, JSON, CORS (endpoints listed at the top)
tests/            unittest suite with small fixtures
data/             runtime state (git-ignored): prepared/<id>.sqlite3, chats.sqlite3, optional lectures.json
```

## How the server finds a lecture's sources

The first time the web app asks about a lecture, the server prepares it from the web app's files:
- the transcript `apps/web/public/media/<id>.json` (plain WhisperX output works too)
- the first `"kind": "slides"` PDF in `apps/web/public/media/<id>/materials.json`, using its `links` as reviewed
  time→page links

The result is cached in `data/prepared/<id>.sqlite3`. It's rebuilt only when the content of those files changes, and a
rebuild clears that lecture's saved chapters. Use `--media-dir` to point to another folder.
`data/lectures.json` can map an id to a database you prepared yourself, e.g. `{ "ml-02": "ml-02.sqlite3" }`.

Chats are stored in `data/chats.sqlite3`. Each answer includes the chat's last 10 messages, so follow-up questions work.
Answers cite `[m:ss]`, `[m:ss-m:ss]` and `[PDF p. N]`, which the web app turns into links.
Privacy: each question sends the full transcript text, all PDF page text, the selection and the chat history to
OpenRouter. The API key stays on the server.

## Command line

```bash
python lecture_cli.py prepare --transcript transcript.json --pdf slides.pdf --reviewed-links reviewed_links.json
python lecture_cli.py timeline
python lecture_cli.py show --start 331.6 --end 366.6
python lecture_cli.py ask --start 331.6 --end 366.6 'Why does the matrix have I + 1 columns?'
python lecture_cli.py ask 'Which activation functions are recommended?'   # whole lecture
python lecture_cli.py generate-chapters [--force] [--duration 901]
python lecture_cli.py chapters
```

`--db` selects the database (default `lecture.sqlite3`), and `--env-file` the settings file (default `.env`).
`--dry-run` prints what would be sent to the model. Running `prepare` again replaces the lecture and clears its chapters.
The matcher proposes related pages by lexical relevance. Only reviewed links were checked against the recording.
