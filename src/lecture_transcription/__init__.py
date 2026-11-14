"""Public interface for the lecture transcription module."""

from .core import detect_lecture_language, transcribe_lecture

__all__ = ["detect_lecture_language", "transcribe_lecture"]
