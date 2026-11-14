"""Translate an existing transcript JSON through OpenRouter."""

import argparse
import json
import math
import os
import re
import tempfile
from pathlib import Path

from . import client
from .core import DEFAULT_MODEL, assemble_translation, build_request, cache_matches, estimate_request_cost
from .service import translate_transcript


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("transcript", type=Path, help="Original Whisper transcript.json")
    parser.add_argument("--target-language", required=True, choices=["en", "it"])
    parser.add_argument("--model", default=DEFAULT_MODEL, help="OpenRouter model ID supporting JSON Schema")
    parser.add_argument("--output-dir", type=Path, help="Exact translation directory; default: next to source under translations/<language>")
    parser.add_argument("--max-output-tokens", type=int, default=65536)
    parser.add_argument("--timeout", type=float, default=1800)
    parser.add_argument("--max-estimated-cost", type=float, default=0.10,
                        help="Refuse a live request above this conservative USD estimate (default: 0.10)")
    parser.add_argument("--prepare-only", action="store_true", help="Save the complete API request without making a network call")
    parser.add_argument("--overwrite", action="store_true", help="Regenerate an existing translation")
    args = parser.parse_args()
    try:
        source_path = args.transcript.expanduser().resolve()
        source = json.loads(source_path.read_text(encoding="utf-8"))
        payload = build_request(source, args.target_language, args.model, args.max_output_tokens)
        if not re.fullmatch(r"[A-Za-z0-9_-]+", source["lecture_id"]):
            raise ValueError("Source lecture_id must use letters, digits, underscores or hyphens.")
        destination = (args.output_dir.expanduser().resolve() if args.output_dir else
                       source_path.parent / "translations" / args.target_language)
        if destination == source_path.parent:
            raise ValueError("Translation output must use a different directory from the original transcript.")
        if not math.isfinite(args.timeout) or args.timeout <= 0:
            raise ValueError("Timeout must be positive.")
        if not math.isfinite(args.max_estimated_cost) or args.max_estimated_cost <= 0:
            raise ValueError("The estimated-cost limit must be positive.")
        estimate = estimate_request_cost(payload)
        json_path = destination / "transcript.json"
        text_path = destination / "transcript.txt"
        if args.prepare_only:
            destination.mkdir(parents=True, exist_ok=True)
            request_path = destination / "translation_request.json"
            if request_path.exists() and not args.overwrite:
                raise ValueError("Prepared request exists; use --overwrite to replace it.")
            request_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"Prepared request: {request_path}\nConservative text-cost estimate: ${estimate['estimated_max_text_cost_usd']:.6f}\nNo API call was made; no translated transcript was created.")
            return 0
        if not args.overwrite and (json_path.exists() or text_path.exists()):
            if json_path.is_file() and text_path.is_file():
                cached = json.loads(json_path.read_text(encoding="utf-8"))
                if (cache_matches(source, cached, args.target_language, args.model)
                        and text_path.read_text(encoding="utf-8").strip() == cached["text"].strip()):
                    print(f"Reused saved translation: {json_path}")
                    return 0
            raise ValueError("Output exists but does not match this request; use --overwrite to regenerate.")
        print(f"Conservative text-cost estimate: ${estimate['estimated_max_text_cost_usd']:.6f}", flush=True)
        print(f"Translating the full lecture with {args.model}...", flush=True)
        translated = translate_transcript(source, args.target_language, args.model,
                                          args.max_output_tokens, args.max_estimated_cost, args.timeout)
        destination.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=".translation-", dir=destination) as temporary:
            temporary = Path(temporary)
            (temporary / "transcript.txt").write_text(translated["text"] + "\n", encoding="utf-8")
            (temporary / "transcript.json").write_text(json.dumps(translated, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
            # Publish authoritative JSON last, after its derived text is ready.
            os.replace(temporary / "transcript.txt", text_path)
            os.replace(temporary / "transcript.json", json_path)
        print(f"JSON: {json_path}\nText: {text_path}")
        return 0
    except (OSError, ValueError, RuntimeError) as failure:
        parser.exit(1, f"Translation failed: {failure}\n")


if __name__ == "__main__":
    raise SystemExit(main())
