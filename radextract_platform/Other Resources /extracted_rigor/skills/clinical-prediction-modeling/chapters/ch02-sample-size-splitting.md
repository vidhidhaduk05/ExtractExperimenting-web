# Ch 2 — Sample Size, Events-per-Variable, and Data Splitting

**Source basis:** Harrell RMS ch4; TRIPOD+AI; Riley et al. sample-size methodology.

## Events per variable (EPV)

- Classical rule: ≥10–20 events per candidate predictor parameter for logistic/Cox models. Count *parameters*, not variables — a 4-knot spline is 3 parameters, a 5-level categorical is 4.
- Below EPV 10: penalization (ch10) or dimension reduction (ch05), not stepwise deletion.
- Report the EPV explicitly in the decision trace.

## Modern sample-size thinking (Riley)

For prediction models, sample size is driven by four targets: (1) small absolute error in the mean prediction, (2) low overfitting (shrinkage ≈ ≥0.9), (3) minimal optimism in AUC, (4) precise fit measures. Use the `pmsampsize` logic: for a binary outcome with expected incidence p and target Cox-Snell R², n ≈ 184·... — in practice, state the expected event proportion and compute; if underpowered for the number of parameters, reduce parameters via splines with fewer knots, penalization, or collapsing categories.

## To split or not to split

- **n < ~1,000 (or events < ~100): do not split.** A single train/test split wastes data and gives an unstable performance estimate. Use full-pipeline bootstrap with out-of-bag evaluation (ch11) or repeated k-fold CV on the whole dataset.
- **Large n:** a single held-out set is acceptable and cheap; still report calibration on the held-out set.
- **Never** tune on the test set, and never impute/normalize/select features before the split.

## Class imbalance

- Rare outcomes (<10% events): report AUC with care (precision-recall may inform), use stratified resampling, and consider class weights in ML baselines. Do not SMOTE-oversample without disclosing it; in clinical cohorts it distorts calibration.
- Worked scale: a 626-patient cohort with ~20% event rate supports ~16 parameters, with a penalization sensitivity analysis.

## Riley's three criteria (Steyerberg ch3)

For planning a development sample with binary/time-to-event outcomes, Riley et al. propose meeting all of:
1. **Small optimism in predictor effects** — shrinkage factor ≥ 0.9 (ch10);
2. **Small overfitting in fit** — apparent vs adjusted Nagelkerke R² difference ≤ 0.05;
3. **Precise mean prediction** — margin of error on the model intercept (e.g., ±0.1 absolute risk), which anchors calibration-in-the-large.

Precision anchors: estimating a risk of 20–80% with ±0.1 margin needs ~96 events; ±0.05 around p=0.5 needs ~384 (192 events). The thresholds are conventions, not laws — state yours. The `pmsampsize` logic implements these criteria; compute rather than guess, and record the inputs (expected event proportion, anticipated R², candidate parameters) in the trace.

## Decision trace entries

Log: candidate predictor count, parameter count, event count, EPV, chosen validation design, and why splitting was rejected (if it was).
