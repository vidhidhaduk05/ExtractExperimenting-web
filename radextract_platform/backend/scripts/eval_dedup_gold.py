#!/usr/bin/env python3
"""Gold-set evaluation script for deduplication cascade.

Ingests JSONL labeled pairs and computes precision, recall, Wilson score 95% CI,
and review-workload estimates against the Zoplicate cascade classifier.
Enforces a >= 0.99 precision gate.

NOTICE: No real-world labeled gold set exists yet. Evaluator validates pipeline
contracts and test distributions only. No production precision claim is made.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any, Optional

# Ensure backend root is on sys.path
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from services import duplicate_finder


DISCLAIMER = (
    "================================================================================\n"
    " NOTICE: No real-world labeled gold set exists yet.\n"
    " Evaluator validates pipeline contracts and test distributions only.\n"
    " No production precision claim is made.\n"
    "================================================================================"
)


def wilson_score_interval(successes: int, total: int, confidence: float = 0.95) -> tuple[float, float]:
    """Calculate Wilson score confidence interval for a proportion."""
    if total == 0:
        return 0.0, 1.0

    # z-value for 95% two-sided is 1.95996
    z = 1.95996 if math.isclose(confidence, 0.95, rel_tol=1e-2) else 1.96
    p_hat = successes / total
    z2 = z * z
    denom = 1.0 + z2 / total
    center = (p_hat + z2 / (2.0 * total)) / denom
    margin = (z / denom) * math.sqrt((p_hat * (1.0 - p_hat) / total) + (z2 / (4.0 * total * total)))
    lower = max(0.0, center - margin)
    upper = min(1.0, center + margin)
    return lower, upper


def evaluate_pair(study_a: dict, study_b: dict) -> tuple[bool, str, dict]:
    """Classify a pair using duplicate_finder and return (is_auto_duplicate, tier, signals)."""
    sa = dict(study_a)
    sb = dict(study_b)
    sa.setdefault("study_id", "mock_a")
    sb.setdefault("study_id", "mock_b")
    pairs = duplicate_finder.find_candidate_pairs([sa, sb])
    if not pairs:
        return False, "none", {}
    pair = pairs[0]
    return bool(pair.auto_mergeable), pair.tier, pair.signals


def evaluate_labeled_records(records: list[dict], min_precision: float = 0.99) -> dict[str, Any]:
    """Evaluate a list of labeled pair records.

    Expected record schema:
    {
        "study_a": { "title": ..., "doi": ..., "pmid": ..., ... },
        "study_b": { "title": ..., "doi": ..., "pmid": ..., ... },
        "label": "duplicate" | "non_duplicate"  (or "is_duplicate": bool)
    }
    """
    tp = 0
    fp = 0
    tn = 0
    fn = 0
    review_count = 0
    details = []

    for idx, rec in enumerate(records):
        sa = rec.get("study_a", {})
        sb = rec.get("study_b", {})
        if "label" in rec:
            ground_truth = rec["label"] == "duplicate"
        else:
            ground_truth = bool(rec.get("is_duplicate", False))

        is_auto, tier, signals = evaluate_pair(sa, sb)
        is_review = tier in ("conflict", "human_review") or ("review_only: nct_registration" in signals)

        if is_review:
            review_count += 1

        if is_auto:
            if ground_truth:
                tp += 1
                outcome = "TP"
            else:
                fp += 1
                outcome = "FP"
        else:
            if ground_truth:
                fn += 1
                outcome = "FN"
            else:
                tn += 1
                outcome = "TN"

        details.append({
            "index": idx,
            "ground_truth": "duplicate" if ground_truth else "non_duplicate",
            "tier": tier,
            "auto_mergeable": is_auto,
            "outcome": outcome,
        })

    predicted_positives = tp + fp
    precision = (tp / predicted_positives) if predicted_positives > 0 else 1.0
    actual_positives = tp + fn
    recall = (tp / actual_positives) if actual_positives > 0 else 1.0
    ci_lower, ci_upper = wilson_score_interval(tp, predicted_positives) if predicted_positives > 0 else (1.0, 1.0)
    total_pairs = len(records)
    review_workload_rate = (review_count / total_pairs) if total_pairs > 0 else 0.0

    gate_passed = precision >= min_precision

    return {
        "total_pairs": total_pairs,
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
        "review_count": review_count,
        "review_workload_rate": round(review_workload_rate, 4),
        "precision": round(precision, 4),
        "precision_ci_95": [round(ci_lower, 4), round(ci_upper, 4)],
        "recall": round(recall, 4),
        "min_precision_gate": min_precision,
        "gate_passed": gate_passed,
        "details": details,
    }


def make_mock_evaluation_dataset() -> list[dict]:
    """Generate contract verification test pairs when no external gold set is supplied."""
    return [
        # 1. Valid T0 identical DOI pair -> True duplicate
        {
            "study_a": {"study_id": "1a", "title": "Randomized Trial of Drug X", "doi": "10.1001/jama.2020.1", "year": 2020},
            "study_b": {"study_id": "1b", "title": "Randomized Trial of Drug X", "doi": "10.1001/jama.2020.1", "year": 2020},
            "label": "duplicate"
        },
        # 2. Conflicting PMID on same DOI -> False positive trap! Should veto to review/conflict
        {
            "study_a": {"study_id": "2a", "title": "Paper One", "doi": "10.1001/jama.2020.2", "pmid": "11111", "year": 2020},
            "study_b": {"study_id": "2b", "title": "Paper Two", "doi": "10.1001/jama.2020.2", "pmid": "22222", "year": 2020},
            "label": "non_duplicate"
        },
        # 3. Numeric-differing title -> False positive trap! Should veto to review
        {
            "study_a": {"study_id": "3a", "title": "Trial of Vaccine dose 1", "year": 2021, "authors": "Smith J"},
            "study_b": {"study_id": "3b", "title": "Trial of Vaccine dose 2", "year": 2021, "authors": "Smith J"},
            "label": "non_duplicate"
        },
        # 4. NCT-only match -> Must be review-only (not auto_mergeable)
        {
            "study_a": {"study_id": "4a", "title": "Interim Analysis of NCT01234567 in Lung Cancer", "year": 2021},
            "study_b": {"study_id": "4b", "title": "Final Results for NCT01234567 Follow-up Study", "year": 2022},
            "label": "duplicate"  # Even if related, auto_mergeable is False (review-only)
        },
        # 5. Distinct non-duplicate pair
        {
            "study_a": {"study_id": "5a", "title": "MRI of Glioblastoma Multiforme", "doi": "10.1016/neuro.2019", "year": 2019},
            "study_b": {"study_id": "5b", "title": "PET Scan in Hepatic Metastases", "doi": "10.1016/hep.2021", "year": 2021},
            "label": "non_duplicate"
        },
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate deduplication cascade against labeled gold set.")
    parser.add_argument("--input", "-i", type=str, help="Path to input JSONL labeled pairs file.")
    parser.add_argument("--min-precision", type=float, default=0.99, help="Minimum precision gate (default: 0.99).")
    args = parser.parse_args()

    print(DISCLAIMER)

    if args.input:
        in_path = Path(args.input)
        if not in_path.exists():
            print(f"Error: input file {in_path} not found.", file=sys.stderr)
            return 2
        records = []
        with in_path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    records.append(json.loads(line))
        print(f"Loaded {len(records)} pairs from {in_path}.")
    else:
        print("No --input provided; running synthetic contract evaluation dataset.")
        records = make_mock_evaluation_dataset()

    results = evaluate_labeled_records(records, min_precision=args.min_precision)

    print("\n--- Evaluation Summary ---")
    print(f"Total Pairs Evaluated:   {results['total_pairs']}")
    print(f"True Positives (TP):     {results['tp']}")
    print(f"False Positives (FP):    {results['fp']}")
    print(f"True Negatives (TN):     {results['tn']}")
    print(f"False Negatives (FN):    {results['fn']}")
    print(f"Review Workload Pairs:   {results['review_count']} ({results['review_workload_rate'] * 100:.1f}%)")
    print(f"Precision:               {results['precision'] * 100:.2f}% (Wilson 95% CI: [{results['precision_ci_95'][0]:.4f}, {results['precision_ci_95'][1]:.4f}])")
    print(f"Recall:                  {results['recall'] * 100:.2f}%")
    print(f"Precision Gate:          >= {results['min_precision_gate'] * 100:.1f}% -> {'PASSED' if results['gate_passed'] else 'FAILED'}")

    return 0 if results["gate_passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
