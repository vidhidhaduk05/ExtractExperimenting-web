# Ch 11 — Validation: Full-Pipeline Bootstrap, Out-of-Bag, Nested CV, External

**Source basis:** Harrell RMS ch5; Steyerberg & Harrell (J Clin Epidemiol 2016); ISLP ch5.

## The hierarchy of honesty

1. **Apparent performance** (train = test): always optimistic. Never a result.
2. **Single split:** unbiased but high-variance; wastes data (ch02).
3. **k-fold CV:** better; but must wrap the *entire* pipeline.
4. **Full-pipeline bootstrap with out-of-bag evaluation:** the default for n < ~1,000.
5. **Internal-external validation:** train in some centers, test in held-out centers — tests transportability.
6. **External validation:** fully independent cohort. Without it, label everything discovery-only.

## Full-pipeline bootstrap

For b = 1..B (B = 200–800 depending on compute and claim importance):
1. Draw patients with replacement (size n).
2. **Inside the resample:** fit MICE (ch03), fit any derivation steps (ch06), fit the model.
3. Evaluate on the **out-of-bag** patients (never in the resample).
4. Because every model is evaluated on the *same* out-of-bag patients within each replicate, paired comparisons (AUC differences, Brier differences) are valid — report percentile intervals of the paired differences.

**Why "full pipeline" matters:** any step done once on the full data before resampling — imputation, scaling, feature selection, derivation of the analysis target — leaks. Patients must not contribute to the construction of their own target or their own imputation model.

**Replicate counts per claim:** match compute to claim importance — more replicates for headline numbers, fewer for sensitivity analyses and figure bands. Report the count for each analysis.

## Nested cross-validation (for ML benchmarking)

Outer loop: performance estimation. Inner loop: hyperparameter tuning. Tuning on the outer folds inflates performance — the classic leak. Use `sklearn`'s `GridSearchCV`/`RandomizedSearchCV` *inside* each outer training fold (ch13).

## What to report

- Number of replicates per analysis.
- Percentile intervals, not normal-approximation SEs.
- Paired differences with their percentile intervals for model comparisons.
- Optimism-corrected estimate = apparent − optimism (Harrell's bootstrap) as an alternative framing.

## Steyerberg's validation taxonomy (ch17, ch19)

- **Internal validation** (bootstrap/CV at development) estimates in-sample-setting performance only.
- **Internal-external validation** (train on some centers, test on held-out centers) is the minimum evidence for multi-center transportability; report per-center patterns, not just the pooled number.
- **External validation** (new time/place/institution) reveals **patterns of invalidity** (his ch19): calibration-in-the-large shift, slope miscalibration, discrimination loss — each implying a different updating response (ch18).
- Match the validation claim to the design: only design 6 supports the words "validated externally".

## Anti-patterns

- Imputing/scaling/selecting before the resample.
- Evaluating on in-bag patients.
- Unpaired comparisons of models across different resamples.
- Calling internal validation "external validation" because the test set was "never touched".
- Reporting the best of several validation designs post hoc.
