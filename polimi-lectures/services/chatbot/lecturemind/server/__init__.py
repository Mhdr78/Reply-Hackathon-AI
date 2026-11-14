"""HTTP API used by the web app. Run with `python -m lecturemind.server` (see settings.py for options).

    errors.py     ApiError (status + machine-readable code)
    settings.py   command-line options and default paths
    registry.py   finds or automatically prepares the database of a lecture
    chats.py      persistent chats and messages (SQLite)
    service.py    use cases: lecture status, chapters, answering questions
    fake.py       canned answers and chapters for --fake-llm
    http.py       routing, JSON in/out, CORS
"""
