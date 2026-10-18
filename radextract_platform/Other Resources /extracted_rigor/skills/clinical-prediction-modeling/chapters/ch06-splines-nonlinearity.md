# Ch 6 — Restricted Cubic Splines and Nonlinearity

**Source basis:** Harrell RMS ch2 (and the entire book's philosophy).

## Why splines

Assuming linearity for a continuous predictor is an untested assumption that biases adjusted estimates and can invent or destroy signals. Restricted cubic splines (natural cubic splines with knots at fixed quantiles) are flexible in the data range and *linear beyond boundary knots* — no wild extrapolation.

## Mechanics

- **Knots:** 3 (2 df, mild), 4 (3 df), 5 (4 df) at quantiles of the predictor. Default 4–5 knots when n/event count allows; 3 knots when EPV is tight.
- **Placement:** outer knots at ~5th/95th percentiles (Harrell's default), interior knots evenly spaced in quantiles.
- **Parameters:** k knots → k−1 parameters (k−2 nonlinear terms). Count them in the EPV (ch02).
- **Standardization:** splines are sensitive to predictor scaling; standardize or use quantile placement consistently across resamples.

## Testing linearity

Fit spline vs linear, compare by likelihood ratio test. Report *how much the choice matters*, not just which is significant: the out-of-sample R² difference, the correlation between linear and spline fitted values, and the agreement in any derived classification. A tiny LR P with negligible R² difference justifies the simpler linear model as a sensitivity analysis; a large shape difference justifies the spline as primary.

## Residual-based phenotyping (a reusable template)

To define "greater-than-expected change" from serial measurements: regress the follow-up increment on an RCS of the baseline value; the **residual** is excess change — orthogonal to the baseline by construction. Fit this derivation *inside each bootstrap resample* so out-of-bag patients don't contribute to their own target (ch11). When the target is a residual, this ordering is not optional.

**Algebraic check for serial measurements:** if baseline + increment = follow-up value, a model containing both baseline and increment is a reparameterization of the follow-up value. Before claiming that two serial measurements each add independent information, verify the parameterization doesn't make the claim true by construction.

## Degrees-of-freedom budget (Steyerberg ch9, ch12)

- Think of flexibility as a **budget spent across the model**: every spline, interaction, and categorical expansion consumes parameters against a fixed EPV (ch02). Spend it where the outcome relationship is most plausible and least constrained — not uniformly.
- **Additivity first, nonlinearity second**: before adding spline flexibility, test whether a clinically plausible interaction (additivity violation) matters more; Steyerberg's ch12 treats additivity and linearity as the two assumption families to check explicitly.
- **Restrict candidate predictors by external knowledge** (his ch10): known-effect directions, mandatory clinical covariates, and structural restrictions (e.g., hierarchical) reduce the effective parameter count before any data-driven selection — the cheapest overfitting protection there is.

## Practical rules

- Plot the fitted spline with CIs; show the data density (rug/histogram) so flat regions with no support are visible.
- Do not interpret spline shape outside the observed data range.
- If a spline term is unstable across resamples (sign flips), the data don't support that flexibility — reduce knots or go linear and say so.

## Anti-patterns

- Dichotomizing continuous predictors at the median "for interpretability" (ch05).
- Choosing the number of knots by which gives the smaller P-value.
- Fitting the spline on all data, then bootstrapping only the final model.
- Extrapolating spline curves beyond the 5th–95th percentile support.
