# Ch 10 — Penalization and Shrinkage

**Source basis:** Harrell RMS ch4 (shrinkage), ch25; ESL ch3; ISLP ch6.

## Why penalize

With EPV < ~20 (ch02), unpenalized MLEs are inflated — calibration slopes below 1 appear even at n in the high hundreds with only ~16 parameters. Penalization trades a little bias for a lot of variance reduction.

## The three workhorses

- **Ridge (L2):** shrinks all coefficients; keeps correlated predictors together. Default when every predictor is believed relevant.
- **Lasso (L1):** shrinks and selects; unstable when predictors are correlated (arbitrarily picks one). Use when a sparse model is genuinely desired.
- **Elastic net:** compromise; the sensible default for correlated clinical/imaging predictors.

## Practical rules

- **Standardize predictors before penalizing** (inside the pipeline, fit on training folds only).
- **λ chosen by CV inside the training resample** — never on the evaluation set. For one-standard-error rule: more parsimonious, slightly worse CV performance.
- **Report the shrinkage factor** (e.g., van Houwelingen–Le Cessie heuristic: 1 − (model df)/(apparent chi-square)) for unpenalized models as a diagnostic.
- Penalized models still need full-pipeline validation (ch11) — penalization reduces optimism, it doesn't eliminate it.

## Post-estimation

- Calibration slope after penalization should approach 1; if it doesn't, increase the penalty.
- Coefficient paths (λ traces) show stability — a predictor that enters only at extreme λ is fragile; say so.

## Modern estimation landscape (Steyerberg ch13–14)

- Steyerberg's ch13 places lasso and elastic net inside a continuum of **modern estimation methods** — all sharing one idea: accept some bias to reduce variance when the data are thin. The choice among them matters less than the decision to regularize at all.
- **Shrinkage factor ≥ 0.9** (Riley's criterion, ch02) is the quantitative trigger: estimate the heuristic shrinkage (1 − df/apparent chi-square); if below 0.9, penalize.
- **External information** (his ch14): when prior data exist (earlier cohorts, published coefficients), penalizing *toward* those values — rather than toward zero — is often the strongest small-sample option; in Python this is a custom penalty or Bayesian prior, and worth the effort when a validated prior model exists.

## When ML beats penalization

With true interactions/nonlinearities and n in the thousands, boosting can outperform (ch13). With n in the hundreds and ~15–20 well-chosen parameters, penalized regression is usually as good and always more interpretable. Benchmark both fairly (ch13) rather than assuming either.

## Anti-patterns

- Stepwise selection (biased SEs, unstable selection, optimistic fit) — Harrell's cardinal sin.
- Tuning λ on the full dataset before validation.
- Lasso with highly correlated imaging features and presenting the selected set as "the important predictors".
- Forgetting that penalized coefficients are shrunk — ORs are not comparable to unpenalized literature values.
