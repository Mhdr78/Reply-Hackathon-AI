"""LectureMind: answers students' questions about a lecture using its transcript and slides.

Modules:
    config      settings from the environment and .env files
    llm         OpenRouter chat-completion client
    sources     lecture preparation: PDF text extraction, transcript-to-slide matching, the lecture database
    selection   the spoken words inside a selected time range
    prompts     system prompts and request payloads sent to the model
    chapters    LLM chapter generation, validation and storage
    cli         the `lecturemind` command line (formerly lecture_cli.py)
    server      the HTTP API used by the web app
"""

__version__ = "1.0.0"
