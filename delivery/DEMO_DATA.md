# Included demo data — ready to open as ml-01

The Git repository and **with-data ZIP** both contain the actual sample used in the recorded tests.
After extracting it and installing the README dependencies, run the two servers
and open http://127.0.0.1:5173/lectures/ml-01. No source upload is needed.

| Asset | Path relative to the extracted repository |
| --- | --- |
| Original recording, about 15 minutes | `.local/web/media/ml-01.mp4` |
| Original English transcript | `.local/web/media/ml-01.json` |
| Supporting slide PDF, 55 pages | `.local/web/media/ml-01/slides.pdf` |
| UI PDF manifest | `.local/web/media/ml-01/materials.json` |
| Validated Italian translation | `.local/web/translations/ml-01/it/<source-hash>.json` |
| Six cached chapters and prepared sources | `.local/web/prepared/ml-01.sqlite3` |
| Source fingerprint for chapter reuse | `.local/web/prepared/ml-01.source.json` |
| Plain text copies for inspection | `delivery/demo_text/original.en.txt`, `translated.it.txt` |

The `.local` directory is hidden on some systems; it is included in the ZIP and
must remain in the extracted repository root. The application finds it
automatically. The exact `ml-01` demo files are explicitly allowlisted in Git.
Personal chats, secrets, other recordings, vector databases and model caches
remain ignored. A fresh clone opens this same prepared lecture after setup.

Video playback, original/Italian transcript viewing and cached chapters reuse
the included data. New RAG answers still need a local `.env` containing your own
OpenRouter key. Local embedding weights download on first use; they are not
included. The first question builds the local vector index from these sources.

Personal chat history, API secrets, the previous spending ledger and other demo
recordings are not included. Other course entries remain demo catalog entries;
the prepared lecture in this delivery is `ml-01`.

The real sample is distinct from `sample_data/transcript.json`, which remains a
small hand-authored fixture. The recorded sample results are smoke tests, not
claims of general ASR/translation accuracy or long-recording performance.
