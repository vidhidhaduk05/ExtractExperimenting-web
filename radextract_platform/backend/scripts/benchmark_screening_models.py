"""Benchmark harness: Laya-first vs LLM screening on adjudicated data.

Run ON THE HPC (needs the local Laya engine and/or the Biomni-R0 llama-server):

    python scripts/benchmark_screening_models.py --labels labels.jsonl [--limit 100]

labels.jsonl: one JSON object per line:
    {"study_id": "...", "title": "...", "abstract": "...", "adjudicated": "include"|"exclude"}

Reports, per engine path:
  - JSON validity rate (LLM path)
  - latency per study (mean/p95)
  - agreement with adjudicated labels (accuracy + per-class counts)
  - Laya-vs-LLM agreement rate
  - escalation rate (how many studies Laya leaves uncertain at current
    thresholds jev_include_threshold / jev_exclude_threshold / jev_clarify_band)

This harness measures; it does NOT tune. Threshold changes remain a human,
versioned policy decision (blueprint §4E).
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from config import settings  # noqa: E402


def load_labels(path: str, limit: int = 0) -> list[dict]:
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            if not r.get("title") or not r.get("adjudicated"):
                continue
            rows.append(r)
    if limit:
        rows = rows[:limit]
    return rows


def run_laya(rows: list[dict]) -> list[dict]:
    from services import laya_screener
    out = []
    for r in rows:
        t0 = time.perf_counter()
        try:
            res = laya_screener.screen(stage="title", title=r["title"],
                                       abstract=r.get("abstract", ""),
                                       pico={}, exclusion_reasons=[])
            err = None
        except Exception as e:
            res, err = None, str(e)
        dt = time.perf_counter() - t0
        out.append({
            "study_id": r["study_id"], "adjudicated": r["adjudicated"],
            "decision": (res or {}).get("decision"), "confidence": (res or {}).get("confidence"),
            "latency_s": round(dt, 4), "error": err,
        })
    return out


def run_llm(rows: list[dict]) -> list[dict]:
    from services.llm_client import get_client
    from services.llm_extractor import screen_title_only_with_llm
    client = get_client()
    out = []
    for r in rows:
        t0 = time.perf_counter()
        raw_ok = True
        try:
            res = screen_title_only_with_llm(
                title=r["title"], pico_criteria={}, exclusion_reasons=[], client=client)
            decision = res.get("decision")
        except Exception as e:
            res, decision, raw_ok = {}, None, False
            res = {"decision": None, "confidence": 0.0, "error": str(e)}
        dt = time.perf_counter() - t0
        out.append({
            "study_id": r["study_id"], "adjudicated": r["adjudicated"],
            "decision": decision, "confidence": res.get("confidence"),
            "json_valid": raw_ok, "latency_s": round(dt, 4),
            "error": res.get("error"),
        })
    return out


def agreement_stats(rows: list[dict], engine: str) -> dict:
    decided = [r for r in rows if r.get("decision") in ("include", "exclude")]
    correct = [r for r in decided if r["decision"] == r["adjudicated"]]
    lat = [r["latency_s"] for r in rows]
    lat_sorted = sorted(lat)
    p95 = lat_sorted[int(0.95 * (len(lat_sorted) - 1))] if lat_sorted else 0.0
    return {
        "engine": engine,
        "n": len(rows),
        "decided": len(decided),
        "uncertain_or_error": len(rows) - len(decided),
        "agreement_with_adjudicated": round(len(correct) / len(decided), 4) if decided else None,
        "latency_mean_s": round(statistics.mean(lat), 4) if lat else None,
        "latency_p95_s": round(p95, 4),
        "json_validity": round(sum(1 for r in rows if r.get("json_valid", True)) / len(rows), 4) if rows else None,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--labels", required=True)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--skip-llm", action="store_true", help="Laya path only (no llama-server needed)")
    args = ap.parse_args()

    rows = load_labels(args.labels, args.limit)
    if not rows:
        print("No usable labels found.")
        return 1
    print(f"Loaded {len(rows)} adjudicated labels.")
    print(f"Current thresholds: include>={settings.jev_include_threshold} "
          f"exclude>={settings.jev_exclude_threshold} clarify_band={settings.jev_clarify_band}")

    laya_rows = run_laya(rows)
    print("\n== LAYA (System-1, local) ==")
    print(json.dumps(agreement_stats(laya_rows, "laya"), indent=2))

    if not args.skip_llm:
        llm_rows = run_llm(rows)
        print("\n== LLM (Biomni-R0 via llama-server) ==")
        print(json.dumps(agreement_stats(llm_rows, "biomni-r0"), indent=2))

        both = [(l, m) for l, m in zip(laya_rows, llm_rows)
                if l.get("decision") in ("include", "exclude")
                and m.get("decision") in ("include", "exclude")]
        if both:
            agree = sum(1 for l, m in both if l["decision"] == m["decision"])
            print(f"\nLaya-vs-LLM agreement: {agree}/{len(both)} = {agree/len(both):.4f}")

        escalations = sum(1 for l in laya_rows if l.get("decision") not in ("include", "exclude"))
        print(f"Escalation rate at current thresholds: {escalations}/{len(rows)} "
              f"({escalations/len(rows):.2%}) — LLM calls avoided: {len(rows)-escalations}")

    print("\nNote: agreement on a small adjudicated sample is a tuning signal, "
          "not a validation study. See blueprint §G for the validation contract.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
