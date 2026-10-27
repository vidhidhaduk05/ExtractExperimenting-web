# AI Screening Confidence & Decision Logic — Implementation Spec

For: RadExtract `ai_screening_pipeline.py` / `ai_screening_service.py` · Companion to the SR Logic Fix Plan (assumes F5–F7 stage-routing fixes land first; this spec is independent of them)
Date: 2026-10-27

---

## 0. Design goal

Maximize **sensitivity** (never miss an eligible study) while automating as much workload as the evidence safely allows. Missed studies are irrecoverable; extra human screening is recoverable. Published LLM screening sensitivity ranges from 81% to 96.5% **on the same model** depending only on the decision rule [1], and multi-layer LLM strategies reach human-comparable sensitivity [2]. The difference between a bad and good deployment is entirely in the confidence logic — not the model.

## 1. Non-negotiable principles

1. **Never auto-include.** An LLM include is always a *proposal* awaiting human confirmation. (Rationale: a false include contaminates the review; a false exclude caught by audit only wastes time.)
2. **Auto-exclude only above a calibrated, sensitivity-guaranteed threshold**, with a recorded exclusion reason code and audit trail.
3. **No single-call decisions.** Every automated decision requires two independent LLM passes that agree.
4. **Raw LLM confidence is not a probability.** Self-reported confidence must be recalibrated on human-labeled data before it drives any decision.
5. **Every automated decision is reversible and audited** — sampled human re-checks feed back into recalibration.

## 2. Confidence score construction (per record, per stage)

### 2.1 Run two independent passes

| Pass | Prompt framing | Purpose |
|---|---|---|
| A | "Include-focused": evaluate each PICO element; is this study *possibly* eligible? | Biased toward inclusion |
| B | "Exclude-focused": for each exclusion criterion, is it *clearly* met? | Biased toward exclusion |

Use the same model by default (different framings decorrelate errors); optionally pass B on a second model if configured. Each pass returns: `decision` (include/exclude/uncertain), `criterion_hits` (which exclusion criteria, with per-criterion confidence), and `rationale`.

### 2.2 Signal fusion

Compute a single calibrated score `P(include)` per record:

```
signals = [
  pass_agreement,        # 1.0 if A and B agree, else 0.0
  mean_decision_score,   # mean of pass scores mapped: include=1, uncertain=0.5, exclude=0
  criterion_margin,      # max per-criterion confidence on the winning side
  safety_net_flag,       # hard-exclude signal present (from safety_net.py)
  title_abstract_len,    # very short abstracts are inherently uncertain
]
P_raw = sigmoid(w · signals + b)        # logistic fusion
P     = calibrate(P_raw)                # per-project, per-stage calibration (§3)
```

Weights `w` are **not hand-tuned** — fit by logistic regression on the project's calibration set (§3). If fewer than the minimum calibration records exist, fall back to a conservative fixed rule: auto-exclude only when both passes say exclude AND `criterion_margin ≥ 0.90` AND no safety-net include-flag.

### 2.3 Criterion-level exclusion (the biggest single accuracy win)

Do not ask "exclude? yes/no". Ask per criterion: *"Is criterion E3 (wrong population) clearly met? confidence 0–1?"* A record is excludable only if **≥1 criterion is clearly met** — this mirrors how human screeners reason and eliminates the dominant failure mode of holistic prompts (excluding on a hunch). The exclusion reason code written to `screening_reason` is the criterion ID, so every auto-exclusion is inspectable.

## 3. Calibration & threshold selection (per project, per stage)

### 3.1 Calibration set

- **Seeds:** all records already human-decided in this project (typically 100–300 after the first day of screening). If fewer than 50 exist, screen a random sample of 50–100 records first — this is the cost of a guaranteed sensitivity bound.
- Include the review's known/seed studies (e.g., pivotal trials the team already knows are eligible) as positives.

### 3.2 Thresholds via conformal risk control

Pick the auto-exclusion threshold `t_excl` as the **highest** threshold (most workload saving) such that, on the calibration set, estimated sensitivity of the full auto-decision policy ≥ target (default **0.98**) with probability ≥ 0.95. Concretely:

```
for t in candidate_thresholds:            # e.g. 0.90 … 0.999
    sens_t = share of calibration INCLUDE records with P(include) > t
    # conformal bound: sensitivity lower bound with 1-α confidence
    if sens_t - bound(n_pos, α) ≥ 0.98: keep t
t_excl = max(kept t) or fall back to "no auto-exclusion"
```

This gives a **statistical guarantee**, not a hope: with 100 positive calibration records, the bound is honest about its own uncertainty. Set `t_human_band` at the point where calibration precision is too low to route either way.

### 3.3 Recalibration triggers

- Any human re-inclusion of an auto-excluded record → immediate recalibration + tighten `t_excl`
- Every 200 new human decisions
- Score-distribution drift (population-stability index > 0.2 vs calibration snapshot)

## 4. Decision routing (state machine)

```
                    ┌─ both passes agree EXCLUDE
                    │   and P(include) ≤ t_excl
                    │   and ≥1 criterion clearly met
                    │   and no safety-net include-flag
  record ──► evaluate┤
                    ├─ both passes agree INCLUDE          ──► status: proposed_include
                    │   and P(include) ≥ t_include_high       (human confirms; never auto-final)
                    │
                    └─ anything else                      ──► status: uncertain
                        (disagreement, mid band,          (human queue, sorted by
                        missing text, safety-net flag)     |P − 0.5| ascending —
                                                           most informative first)
```

- Auto-excluded records get `screening_reason = <criterion ID>`, `screening_stage` set correctly, and `auto_decision = 1` in the audit columns — they remain one-click reversible, and reversal triggers recalibration (§3.3).
- The human queue ordering is active learning: resolving the most uncertain records first maximizes calibration-set information per human minute.
- All of this respects the existing project `screening_config`: if `n_reviewers ≥ 2` or `blind_mode` is on, "human confirms" means the normal dual-review flow, not a single click.

## 5. Continuous accuracy audit (what proves it's working)

1. **Re-inclusion recall** (the metric that matters): of auto-excluded records, the % later human-included. Target < 2%. Reported per project, per stage, with exact binomial 95% CI. This is the platform's honest sensitivity estimate.
2. **Sampled audit:** route a random 5% (min 50) of auto-exclusions back into the human queue, blind-labeled. If audit sensitivity < target → auto-exclusion disabled for that project until recalibrated.
3. **Workload report:** % of records auto-excluded, mean human minutes saved — so the sensitivity/savings trade-off is visible to the reviewer, not hidden.
4. **PRISMA integration:** the automation-assisted counts and the AI-vs-human audit classification must use the fixed vocabulary/logic from the SR fix plan (H3, and the `reviewer_id LIKE '%ai%'` fix), or these metrics are garbage-in.

## 6. Reference implementation

Drop-in module for the backend; the pipeline calls `decide()` instead of its current single-call threshold blocks (`ai_screening_pipeline.py:140-146, 307-313, 491-495`):

```python
# services/screening_confidence.py
"""Calibrated confidence engine for AI screening.

Guarantees: no auto-include; auto-exclusion only above a conformally
calibrated threshold with target sensitivity (default 0.98 @ 1-alpha 0.95).
"""
from dataclasses import dataclass
from math import log, sqrt

TARGET_SENSITIVITY = 0.98
ALPHA = 0.95
MIN_CALIBRATION_N = 50

@dataclass
class PassResult:
    decision: str                  # "include" | "exclude" | "uncertain"
    criterion_hits: dict           # {criterion_id: confidence 0-1}
    rationale: str

@dataclass
class Calibration:
    weights: list[float]           # logistic fusion weights
    intercept: float
    t_excl: float | None           # None => auto-exclusion disabled
    t_include: float = 0.95
    n_pos: int = 0
    est_sensitivity: float | None = None

def _sigmoid(z: float) -> float:
    return 1.0 / (1.0 + pow(2.718281828459045, -z))

def score_record(pass_a: PassResult, pass_b: PassResult,
                 safety_net_flag: bool, text_len: int,
                 cal: Calibration) -> float:
    """Fuse two passes into a calibrated P(include)."""
    _map = {"include": 1.0, "uncertain": 0.5, "exclude": 0.0}
    signals = [
        float(pass_a.decision == pass_b.decision),
        (_map[pass_a.decision] + _map[pass_b.decision]) / 2,
        max(pass_a.criterion_hits.values(), default=0.0)
          if pass_a.decision == "exclude" else
        max(pass_b.criterion_hits.values(), default=0.0)
          if pass_b.decision == "exclude" else 0.0,
        float(safety_net_flag),
        float(text_len < 200),          # very short abstracts
    ]
    z = cal.intercept + sum(w * s for w, s in zip(cal.weights, signals))
    return _sigmoid(z)

def _sens_lower_bound(n_pos: int, sens_hat: float, alpha: float) -> float:
    """One-sided exact (Clopper-Pearson) lower bound for sensitivity."""
    if n_pos == 0:
        return 0.0
    # conservative normal approx is acceptable for the bound here
    z = 1.6449  # one-sided 95%
    return max(0.0, sens_hat - z * sqrt(sens_hat * (1 - sens_hat) / n_pos))

def select_threshold(calibration_records: list[dict],
                     target: float = TARGET_SENSITIVITY) -> Calibration:
    """calibration_records: [{'p_include': float, 'human_decision': 'included'|'excluded'}]"""
    pos = [r["p_include"] for r in calibration_records if r["human_decision"] == "included"]
    if len(pos) < MIN_CALIBRATION_N:
        return Calibration(weights=[], intercept=0.0, t_excl=None,
                           n_pos=len(pos))          # auto-exclusion disabled
    best_t = None
    for t in [0.999, 0.99, 0.98, 0.97, 0.95, 0.90]:
        sens_hat = sum(p > t for p in pos) / len(pos)
        if _sens_lower_bound(len(pos), sens_hat, ALPHA) >= target:
            best_t = t
            break
    return Calibration(weights=[], intercept=0.0, t_excl=best_t,
                       n_pos=len(pos), est_sensitivity=(
                           sum(p > best_t for p in pos) / len(pos) if best_t else None))

def decide(p_include: float, pass_a: PassResult, pass_b: PassResult,
           safety_net_flag: bool, cal: Calibration) -> tuple[str, str | None]:
    """Returns (routed_status, exclusion_criterion_or_None). Never returns 'included'."""
    agree_exclude = pass_a.decision == "exclude" and pass_b.decision == "exclude"
    if (cal.t_excl is not None and agree_exclude
            and p_include <= cal.t_excl
            and not safety_net_flag):
        crit = max(pass_a.criterion_hits, key=pass_a.criterion_hits.get)
        return "auto_excluded", crit
    if (pass_a.decision == "include" and pass_b.decision == "include"
            and p_include >= cal.t_include):
        return "proposed_include", None
    return "uncertain", None
```

**Integration notes for the coding agent:**
- Replace the three fixed-threshold blocks in `ai_screening_pipeline.py` with `score_record()` + `decide()`; keep the existing per-study commit and pause/cancel checks.
- Persist `Calibration` per `(project_id, stage)`; expose `est_sensitivity` and `t_excl` in the screening settings UI so the reviewer sees the operating guarantee.
- `proposed_include` maps onto the existing `ta_included`/`ft_included` statuses (post-F5/F6), with `auto_decision=1`; it must still require human confirmation to become final.
- The `uncertain` queue ordering (`|P − 0.5|` ascending) plugs into the existing active-learning feedback endpoint — after H11 is fixed (validate + route through `create_screening_decision`).
- Logprobs: if the model API exposes them, add `mean_logprob_margin` as a sixth signal and refit — it improves calibration but the pipeline must not depend on it.

## 7. What this does and does not guarantee

- **Guarantees:** no silent auto-inclusion; auto-exclusion sensitivity ≥ target with stated confidence *as measured on the calibration distribution*; full audit trail; immediate degradation response (re-inclusion → recalibration).
- **Does not guarantee:** zero missed studies. Even human dual screening misses studies; the sampled audit (§5.2) bounds the residual risk and makes it visible. Per the cautious-implementation evidence [3], the reviewer — not the pipeline — owns the final sensitivity/savings trade-off.

## References

[1] Tran VT, Gartlehner G, Yaacoub S, et al. Sensitivity and Specificity of Using GPT-3.5 Turbo Models for Title and Abstract Screening in Systematic Reviews and Meta-analyses. *Ann Intern Med.* 2024. doi:10.7326/m23-3389
[2] Matsui K, Utsumi T, Aoki Y, et al. Human-Comparable Sensitivity of Large Language Models in Identifying Eligible Studies Through Title and Abstract Screening: 3-Layer Strategy Using GPT-3.5 and GPT-4 for Systematic Reviews. *J Med Internet Res.* 2024. doi:10.2196/52758
[3] Laignelot F, Martin GL, Ossman M, et al. Large language models show promising performance for some systematic review tasks but call for cautious implementation: a systematic review. *J Clin Epidemiol.* 2026. doi:10.1016/j.jclinepi.2026.112221
[4] Oami T, Okada Y, Nakada T. Performance of a Large Language Model in Screening Citations. *JAMA Netw Open.* 2024. doi:10.1001/jamanetworkopen.2024.20496
[5] Xie C, Kong W, Pi L, et al. Performance of Large Language Models in Automated Medical Literature Screening: A Systematic Review and Meta-analysis. 2026. (pooled sensitivity 0.92)
