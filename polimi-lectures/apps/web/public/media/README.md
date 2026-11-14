# Lecture media (local only, git-ignored)

Files named after the lecture id from the URL (`/lectures/ml-01` → `ml-01`):

```
ml-01.mp4                      video (falls back to VITE_LECTURE_VIDEO_URL)
ml-01.json                     WhisperX transcript → "Transcript ready"; also the assistant's transcript
ml-01/materials.json           PDFs shown in the sidebar; the first "slides" PDF is the assistant's slide deck
ml-01/<file>.pdf
```

`materials.json`:

```json
{ "files": [
  { "file": "slides.pdf", "title": "From Perceptrons to Feed-Forward Neural Networks", "kind": "slides",
    "links": [ { "start": 94.4, "end": 289.3, "page": 17 } ] },
  { "file": "notes.pdf", "title": "Lecture notes", "kind": "notes" }
] }
```

Lecture recordings and slides are course material: keep them out of the repository.
