"""Transcribe a lecture recording into timestamped JSON for the RAG pipeline."""

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

# On macOS, Conda's Numba and pip's PyTorch may load different OpenMP runtimes.
# Select Numba's built-in scheduler before importing either library.
if sys.platform == "darwin":
    os.environ.setdefault("NUMBA_THREADING_LAYER", "workqueue")

import torch
import whisper
import numpy as np


SUPPORTED_LANGUAGES = ("en", "it")


def detect_lecture_language(model, audio: np.ndarray) -> str:
    """Choose English or Italian using up to three parts of the recording."""
    window = whisper.audio.N_SAMPLES
    max_start = max(0, len(audio) - window)
    starts = sorted({0, min(60 * whisper.audio.SAMPLE_RATE, max_start), max_start // 2})
    scores = {code: 0.0 for code in SUPPORTED_LANGUAGES}
    samples_used = 0
    for start in starts:
        sample = audio[start : start + window]
        # This filters near-silence, not music. Multiple samples reduce the
        # influence of introductory music or a misleading opening passage.
        if not len(sample) or float(np.sqrt(np.mean(sample ** 2))) < 0.0001:
            continue
        mel = whisper.log_mel_spectrogram(
            whisper.pad_or_trim(sample), n_mels=model.dims.n_mels
        ).to(model.device)
        _, probabilities = model.detect_language(mel)
        for code in SUPPORTED_LANGUAGES:
            scores[code] += probabilities[code]
        samples_used += 1

    if not samples_used:
        raise ValueError("Audio is empty or too quiet to detect English or Italian.")
    language = max(scores, key=scores.get)
    name = {"en": "English", "it": "Italian"}[language]
    print(f"Detected language: {name} (English/Italian only, {samples_used} samples)", flush=True)
    return language


def transcribe_lecture(
    video_path: str | Path,
    lecture_id: str,
    model_name: str = "small",
    language: str | None = None,
    device: str = "auto",
) -> dict:
    """Return speech in its original language, timed from the recording's start."""
    video = Path(video_path).expanduser()
    if not video.is_file():
        raise FileNotFoundError(f"Recording not found: {video}")
    if not shutil.which("ffmpeg"):
        raise RuntimeError("FFmpeg is missing. On macOS, run: brew install ffmpeg")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", lecture_id):
        raise ValueError("Lecture ID must use letters, numbers, underscores or hyphens.")
    if device not in {"auto", "cpu", "cuda"}:
        raise ValueError("Device must be auto, cpu or cuda.")
    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable. Use --device cpu on this Mac.")
    if model_name not in whisper.available_models():
        raise ValueError(f"Unknown Whisper model: {model_name}")
    if language == "auto":
        language = None
    if language is not None and language not in SUPPORTED_LANGUAGES:
        raise ValueError("Language must be auto, en or it.")
    if model_name.endswith(".en") and language != "en":
        raise ValueError("Use a multilingual model such as small for English/Italian detection.")

    print(f"Loading Whisper {model_name} on {device}...", flush=True)
    model = whisper.load_model(model_name, device=device)
    # Decode once and reuse the unchanged waveform for detection/transcription.
    audio = whisper.load_audio(str(video))
    if language is None:
        language = detect_lecture_language(model, audio)
    print(f"Transcribing {video.name}...", flush=True)
    result = model.transcribe(
        audio,
        task="transcribe",
        language=language,
        word_timestamps=True,
        fp16=(device == "cuda"),
        verbose=False,
    )

    # Keep the full recording timeline: do not remove silence or shift timestamps.
    return {
        "schema_version": "1.0",
        "lecture_id": lecture_id,
        "source_video": video.name,
        "engine": "openai-whisper",
        "model": model_name,
        "language": result["language"],
        "timestamp_unit": "seconds",
        "text": result["text"].strip(),
        "segments": [
            {
                "segment_id": f"{lecture_id}_{index:05d}",
                "start": segment["start"],
                "end": segment["end"],
                "text": segment["text"].strip(),
                "words": segment.get("words", []),
            }
            for index, segment in enumerate(result["segments"])
        ],
    }
