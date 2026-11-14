"""Check that both entry points reach normal input validation without a model."""

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


class CommandEntryPointTests(unittest.TestCase):
    def test_missing_recording_fails_cleanly_through_both_entry_points(self):
        root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as directory:
            missing = str(Path(directory) / "missing recording.mp4")
            for entry in [[str(root / "transcribe.py")], ["-m", "lecture_transcription"]]:
                with self.subTest(entry=entry):
                    result = subprocess.run(
                        [sys.executable, *entry, missing, "--lecture-id", "cli_check"],
                        cwd=root,
                        capture_output=True,
                        text=True,
                    )
                    self.assertEqual(result.returncode, 1, result.stderr)
                    self.assertIn("Recording not found", result.stderr)
                    self.assertNotIn("Traceback", result.stderr)


if __name__ == "__main__":
    unittest.main()
