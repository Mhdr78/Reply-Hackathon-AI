import tempfile
from pathlib import Path
import unittest

from lecturemind.config import read_env


class ReadEnvTest(unittest.TestCase):
    def test_parses_quotes_exports_and_comments_and_ignores_other_keys(self):
        with tempfile.TemporaryDirectory() as d:
            env = Path(d) / ".env"
            env.write_text('export OPENROUTER_API_KEY="sk-1 2"\nOPENROUTER_MODEL=a/b  # comment\nOTHER=x\n')
            self.assertEqual(read_env(env), {"OPENROUTER_API_KEY": "sk-1 2", "OPENROUTER_MODEL": "a/b"})

    def test_missing_file_is_empty(self):
        self.assertEqual(read_env(Path("/nonexistent/.env")), {})
