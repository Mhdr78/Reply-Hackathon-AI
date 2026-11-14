# Delivery checklist

This maps the supplied hackathon checklist to the actual coding delivery.
Presentation slides are intentionally not created in this package.

## Level 1 — content supporting the separately delivered pitch

| Requested item | Artifact / status |
| --- | --- |
| Problem: what it is and who experiences it | `PROJECT_BRIEF.md` — problem and affected users |
| Idea: the AI solution in plain language | `PROJECT_BRIEF.md` — idea |
| Use scenario in a real moment | `PROJECT_BRIEF.md` — neural-network revision scenario |
| Target user and context | `PROJECT_BRIEF.md` — EN/IT students, local prototype |
| Success measures | `PROJECT_BRIEF.md` + `VALIDATION.md` — observations separated from future measures |
| 60-second pitch rehearsed | Script ready in `PITCH_SCRIPT.md`; **human rehearsal still required** |
| Presentation file | **Excluded as requested; delivered separately** |

## Level 2 — coding prototype

| Requested item | Artifact / status |
| --- | --- |
| README: how to run, models, libraries, custom logic | `delivery/README.md`, root README, `pyproject.toml`, frontend lockfile |
| Working script, notebook or repository | Complete source snapshot; `run.py`; `src/`; `polimi-lectures/`; tests; repository link |
| Architecture: input, knowledge, tools, decisions, output | `ARCHITECTURE.md`, including Mermaid flow and explicit mapping |
| Example interactions, including one holding its boundary | `EXAMPLE_INTERACTIONS.md` and machine-readable recorded examples |
| Optional interface/frontend or demo video | Working React UI and `assets/ui-preview.jpg`; **no demo video recorded** |

## Packaging and handoff

- Source code and all delivery documents are included in the archive.
- Real `.env` files, secrets, personal chats, spending ledgers, vector caches and
  model weights are excluded. Empty `.env.example` templates are included.
- Git and the with-data archive include the real `ml-01` recording, original transcript,
  slides, validated Italian translation and cached chapter database.
- A clearly labeled hand-authored transcript fixture is included for first use.
- Tests and measured live checks are documented without claiming production
  readiness, general accuracy or three-hour performance.
- Public submission, Git commit/push and human pitch rehearsal remain team actions.
