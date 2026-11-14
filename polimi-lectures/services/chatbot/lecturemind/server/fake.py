"""Deterministic answers and chapters for --fake-llm: exercises the whole flow without calling OpenRouter."""

import json


def fmt(seconds):
    s = int(seconds)
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60}:{s % 60:02d}"


def fake_answer(lecture, selection, question, history):
    lines = [f"**(Fake LLM mode: no OpenRouter call was made.)** You asked: *{question}*", ""]
    if selection:
        lines.append(f"You selected [{fmt(selection['start_s'])}-{fmt(selection['end_s'])}]. "
                     f"The lecturer says there: \"{selection['transcript_excerpt'][:220]}\"")
        pages = sorted({m["page_number"] for m in selection["matched_pdf_pages"]})[:3]
        if pages:
            lines.append("Related slides: " + ", ".join(f"[PDF p. {p}]" for p in pages) + ".")
    else:
        segs = lecture["segments"]
        picks = [segs[int(f * (len(segs) - 1))] for f in (0.1, 0.45, 0.8)]
        lines.append("Some relevant moments:")
        lines += [f"- [{fmt(s['start'])}] {s['text'].strip()}" for s in picks]
        lines.append("See also [PDF p. 17].")
    if history:
        lines += ["", f"_This chat remembers {len(history) // 2} earlier question(s)._"]
    return "\n".join(lines)


def fake_chapters(lecture):
    """Evenly spaced placeholder chapters (same JSON shape as chapters.generate_chapters). Never saved."""
    segs = lecture["segments"]
    count = max(3, min(8, round(segs[-1]["end"] / 150)))
    starts = sorted({round(i * (len(segs) - 1) / count) for i in range(count)})
    end = max(s["end"] for s in segs)
    chapters = []
    for n, i in enumerate(starts):
        words = segs[i]["text"].split()
        title = "Fake chapter: " + " ".join(words[:5]) + ("…" if len(words) > 5 else "")
        stop = segs[starts[n + 1]]["start"] if n + 1 < len(starts) else end
        chapters.append(dict(title=title, start_segment_id=segs[i]["segment_id"],
                             start_s=0.0 if n == 0 else segs[i]["start"], end_s=stop))
    return json.dumps(dict(lecture_id=lecture["lecture_id"], duration_s=end,
                           duration_source="transcript_end", chapters=chapters))
