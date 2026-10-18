# Ch 14 — Interpretability: Permutation Importance, SHAP, Partial Dependence

**Source basis:** Molnar, *Interpretable Machine Learning*; FE&S; APM.

## Hierarchy of interpretability

1. **Inherently interpretable models** (sparse penalized regression with splines): coefficients ARE the interpretation. Prefer this when performance ties (ch13).
2. **Model-agnostic tools** for black boxes: permutation importance, partial dependence, SHAP.
3. **Local explanations** for individual predictions: SHAP values, counterfactuals.

## Permutation importance

Permute one predictor on evaluation data, measure performance drop. Rules:
- Compute on **out-of-bag/held-out** data, never training data.
- Correlated predictors share importance (permuting one is partially compensated by its twin) — group correlated features or report the caveat.
- Report the full distribution across resamples, not just the mean.

## SHAP

- Additive attribution with solid theory (Shapley values); `shap.TreeExplainer` for boosting.
- **Summary (beeswarm) plots** show direction and magnitude; **dependence plots** with an interaction color reveal effect modification.
- Caveats: SHAP values are attributions, not effects; correlated features distort allocations; do not read SHAP as causal.

## Partial dependence / ALE

- PDP: marginal effect of a predictor averaged over the distribution of the others; misleading under strong correlation (extrapolates impossible combinations) — prefer **ALE** plots then.
- For the spline-regression world, the analogue is the fitted spline curve with CIs (ch06) — show that instead of a PDP when you can.

## Clinical reporting

- Name the tool, the data it was computed on, and its failure modes.
- A black-box model without an interpretability analysis is not deployable in clinical settings — TRIPOD+AI expects the model form and effect directions to be communicated.
- If the interpretability analysis contradicts established clinical knowledge (e.g., higher NIHSS appears protective), suspect data leakage or confounding before celebrating novelty.

## Anti-patterns

- SHAP on training data.
- Reading feature importance as causal importance.
- Presenting PDPs for strongly correlated imaging features without ALE cross-check.
- Using interpretability to retrofit a story onto an unstable model.
