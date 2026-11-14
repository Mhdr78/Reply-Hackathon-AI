# Live demo runbook

## Before presenting

- Follow `README.md`; start the unified backend and frontend.
- Ensure the API key has credit and permits `openai/gpt-6-luna`.
- Load the intended recording, original transcript and PDF with **Upload sources
  for AI**. On this development machine, the existing sample is prepared as
  `ml-01`; the with-data archive includes those real class files in the ready-to-open `ml-01` demo.
- Warm up local models and prepare the Italian translation before the session.
  Model downloads and a new full transcription/translation should not be the
  first action during a short pitch.
- Verify citations against the actual selected materials. The page-17/page-18
  examples below refer to the development sample, not every PDF.

## Short walkthrough (about 90 seconds)

| Time | Action | What it demonstrates |
| --- | --- | --- |
| 0–15 s | Open the prepared lecture; play a few seconds and point to the transcript | Real recording and source-timed transcript |
| 15–30 s | Choose Italiano for transcript language | A translated track retains the original timeline |
| 30–55 s | Set answer language to Italiano and ask `Why does the first weight matrix have I+1 columns?` | Cross-language grounded explanation |
| 55–70 s | Click a video citation and a PDF citation | Inspectable evidence, not only generated text |
| 70–85 s | Ask `What does this lecture teach about photosynthesis in plant leaves?` | Boundary: insufficient evidence, no fabricated source |
| 85–90 s | State what is still a prototype | Honest scope and next steps |

Optional extended checks: select a <=120-second interval; ask a follow-up; open
chapters; ask `Summarize this lecture` with no selection. The overview path uses
all original transcript chunks.

## If the network or model is unavailable

Use the included screenshot and recorded interactions as **previously captured
evidence**. Say the live provider is unavailable; do not present cached captures
as a new successful live call. Local playback and available transcripts remain
useful. `npm run dev:fake` inside `polimi-lectures` starts explicit mock mode and
must be labeled as such; it is not a substitute for evidence of real AI calls.

## No real class files available?

Upload `sample_data/transcript.json` into `ml-01` for a transcript-only test.
Ask `Why does a bias add one column to the weight matrix?`, then the photosynthesis
question. This fixture is authored by the team and has no corresponding video,
PDF or measured ASR result. Supply your own assets to demonstrate those parts.
