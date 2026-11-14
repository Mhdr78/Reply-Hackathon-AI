"""Configuration checks use temporary dummy keys, never local credentials."""

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from lecture_translation import config


class EnvironmentFileTests(unittest.TestCase):
    def test_reads_quoted_key_and_preserves_literal_characters(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            path.write_text('OPENROUTER_API_KEY="test-${LITERAL}-key" # comment\n', encoding="utf-8")
            with patch.dict(os.environ, {"OPENROUTER_API_KEY": "environment-value", "LITERAL": "not-used"}):
                self.assertEqual(config.read_openrouter_key(path), "test-${LITERAL}-key")
                self.assertEqual(os.environ["OPENROUTER_API_KEY"], "environment-value")

    def test_missing_or_blank_file_falls_back_to_environment(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            with patch.dict(os.environ, {"OPENROUTER_API_KEY": "environment-test-key"}):
                self.assertEqual(config.read_openrouter_key(path), "environment-test-key")
                path.write_text("OPENROUTER_API_KEY=\n", encoding="utf-8")
                self.assertEqual(config.read_openrouter_key(path), "environment-test-key")

    def test_editing_file_takes_effect_without_restarting_python(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            path.write_text("OPENROUTER_API_KEY=first-test-key\n", encoding="utf-8")
            self.assertEqual(config.read_openrouter_key(path), "first-test-key")
            path.write_text("OPENROUTER_API_KEY=second-test-key\n", encoding="utf-8")
            self.assertEqual(config.read_openrouter_key(path), "second-test-key")

    def test_source_checkout_env_is_independent_of_working_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            package = root / "src/lecture_translation"
            package.mkdir(parents=True)
            (root / "pyproject.toml").write_text("", encoding="utf-8")
            with patch.object(config, "__file__", str(package / "config.py")), patch.object(Path, "cwd", return_value=root / "elsewhere"):
                self.assertEqual(config.default_env_file(), (root / ".env").resolve())


if __name__ == "__main__":
    unittest.main()
