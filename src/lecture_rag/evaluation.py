"""Evaluate retrieved evidence against explicit, source-specific expectations."""


def matches(hit, expected):
    if hit["source_type"] != expected["source_type"]:
        return False
    if expected.get("document_id") and hit.get("document_id") != expected["document_id"]:
        return False
    if "page_number" in expected:
        return hit.get("page_number") == expected["page_number"]
    if "start_s" in expected:
        return hit.get("start_s", float("inf")) < expected["end_s"] and hit.get("end_s", -1) > expected["start_s"]
    return True


def evaluate(service, cases, with_answers=False):
    rows = []
    for case in cases:
        options = {"lecture_id": case["lecture_id"], "question": case["question"], "course_id": case.get("course_id", "default"),
                   "top_k": case.get("top_k", 5), "selection": case.get("selection")}
        result = service.search(**options, rerank=with_answers)
        expected = case.get("expected_sources", [])
        found = sum(any(matches(hit, source) for hit in result["hits"]) for source in expected)
        row = {"id": case["id"], "expected_source_count": len(expected), "found_source_count": found,
               "source_recall_at_k": found / len(expected) if expected else None,
               "retrieved": [{k: hit[k] for k in ("source_type", "document_id", "page_number", "start_s", "end_s") if k in hit}
                             for hit in result["hits"]]}
        if with_answers:
            answer = service.ask(**options, response_language=case.get("response_language", "en"))
            row["status"] = answer["status"]
            row["answerability_correct"] = (answer["status"] == "answered") == case["expected_answerable"]
        rows.append(row)
    scored = [row["source_recall_at_k"] for row in rows if row["source_recall_at_k"] is not None]
    return {"case_count": len(rows), "mean_source_recall_at_k": sum(scored) / len(scored) if scored else None,
            "answerability_accuracy": sum(row.get("answerability_correct", False) for row in rows) / len(rows) if with_answers and rows else None,
            "note": "Source retrieval/answerability checks do not measure full factual or pedagogical answer quality.", "cases": rows}
