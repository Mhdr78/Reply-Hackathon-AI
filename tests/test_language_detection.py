"""Language-selection regressions; no model download or recording is needed."""

import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import numpy as np
import torch

from lecture_transcription import core as transcribe


class LanguageDetectionTests(unittest.TestCase):
    def detect(self, audio, probabilities):
        model = SimpleNamespace(
            dims=SimpleNamespace(n_mels=80),
            device="cpu",
            detect_language=Mock(side_effect=[(None, item) for item in probabilities]),
        )
        with patch.object(transcribe.whisper, "log_mel_spectrogram", return_value=torch.zeros(80, 3000)):
            return transcribe.detect_lecture_language(model, audio), model.detect_language.call_count

    def test_english_wins_even_if_latin_has_the_highest_overall_score(self):
        audio = np.full(16000, 0.05, dtype=np.float32)
        language, count = self.detect(audio, [{"en": 0.25, "it": 0.05, "la": 0.7}])
        self.assertEqual(language, "en")
        self.assertEqual(count, 1)

    def test_italian_wins_even_if_an_unsupported_language_scores_higher(self):
        audio = np.full(16000, 0.05, dtype=np.float32)
        language, _ = self.detect(audio, [{"en": 0.05, "it": 0.25, "la": 0.7}])
        self.assertEqual(language, "it")

    def test_later_speech_outweighs_a_misleading_intro(self):
        audio = np.full(240 * 16000, 0.05, dtype=np.float32)
        language, count = self.detect(audio, [
            {"en": 0.7, "it": 0.1},
            {"en": 0.05, "it": 0.9},
            {"en": 0.05, "it": 0.9},
        ])
        self.assertEqual(language, "it")
        self.assertEqual(count, 3)

    def test_silent_intro_is_skipped(self):
        audio = np.full(240 * 16000, 0.05, dtype=np.float32)
        audio[:30 * 16000] = 0
        language, count = self.detect(audio, [{"en": 0.1, "it": 0.9}] * 2)
        self.assertEqual(language, "it")
        self.assertEqual(count, 2)

    def test_silence_does_not_silently_default_to_english(self):
        for audio in [np.zeros(16000, dtype=np.float32), np.array([], dtype=np.float32)]:
            with self.subTest(samples=len(audio)):
                with self.assertRaisesRegex(ValueError, "empty or too quiet"):
                    self.detect(audio, [])


if __name__ == "__main__":
    unittest.main()
