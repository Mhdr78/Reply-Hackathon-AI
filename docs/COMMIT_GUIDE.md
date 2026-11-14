# Commit preparation

The implementation is organized as a Python package under `src/`, with tests in
`tests/`, team contracts in `docs/`, local input recordings in `data/`, and local
generated transcripts in `outputs/`.

`transcribe.py` remains at the root as a compatibility entry point. The public
package import is `from lecture_transcription import transcribe_lecture`.
`pyproject.toml` is the source of truth for Python dependencies;
`requirements.txt` installs this project in editable mode.

## Applying the prepared ZIP manually

Extract the archive and copy its contents into the existing repository, including
the hidden `.gitignore`. Keep the existing `.git/`, recordings in `data/`, and
generated files in `outputs/`; the archive contains only placeholder files for
those asset directories and contains no `.git/` directory.

The old root-level `test_transcribe.py` has been replaced by
`tests/test_language_detection.py`. After confirming that replacement is present,
remove the obsolete root test file if it still exists. Do not commit the stale
root test alongside the new package tests. The root `transcribe.py` is different:
keep it, because it is the compatibility entry point.

## Verify from the repository root

```bash
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
python transcribe.py --help
git diff --check
git status --short
```

The unit tests do not download weights or send API requests. A real recording
test is separate; use a short sample and check its text and timing manually.

## Prepare the commit

The commands below are for the repository owner to execute. This preparation
does not itself create a commit or push anything to GitHub.

```bash
git add .gitignore .env.example README.md pyproject.toml requirements.txt transcribe.py translate.py rag.py src/ tests/ docs/ data/.gitkeep outputs/.gitkeep
git diff --cached --stat
git diff --cached --check
```

If the old root-level `test_transcribe.py` was previously committed, also stage
its removal with `git add -u`. The replacement lives under `tests/`.

Inspect the staged list. It should contain code, tests, docs, package metadata,
and placeholder files. Input videos, slides, transcripts, caches, environment
files, and model weights should stay in local or shared asset storage.

Then commit and push to the current branch:

```bash
git commit -m "Organize lecture transcription and document multilingual RAG design"
git push origin HEAD
```

Follow the team's branch/PR workflow if direct pushes to the current branch are
not how the team collaborates. Do not force-push as part of this setup.
