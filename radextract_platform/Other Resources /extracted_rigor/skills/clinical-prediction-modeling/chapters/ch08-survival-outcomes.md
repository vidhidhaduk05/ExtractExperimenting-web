# Ch 8 — Survival / Time-to-Event Outcomes

**Source basis:** Harrell RMS ch18–21; ISLP ch12; TRIPOD+AI.

## When survival analysis is required

Any outcome with censoring: time to death, recurrence, readmission. Treating "died by 90 days" as binary discards timing and mishandles losses to follow-up. If follow-up is nearly complete and the window fixed (90-day mRS), binary analysis is defensible — state why.

## Cox proportional hazards model

- Baseline: `lifelines.CoxPHFitter` or `sksurv`. Time-to-event + event indicator; handle left-truncation if entry times vary.
- Splines for continuous predictors (ch06) — same rules as logistic.
- Ties: Efron (default in lifelines) is fine.

## PH assumption — test it, report it

- **Schoenfeld residual tests** per covariate (log-rank against transformed time) with plots.
- If violated: report time-averaged effects with the caveat, or fit time-varying effects (stratification, time-varying coefficients). Never silently report a global HR when the effect crosses 1 over time.

## Performance metrics for survival models

- **Discrimination:** Harrell's C-index or time-dependent AUC (cumulative/dynamic, e.g., `sksurv.metrics.cumulative_dynamic_auc`) at clinically meaningful horizons (e.g., 90 days). Specify the horizon — a C-index "over all times" is hard to interpret.
- **Calibration:** predicted vs observed survival at fixed horizons (e.g., D-calibration, or KM-based calibration plots by risk group).
- **Brier score** at the horizon with IPCW.

## Competing risks

Death precludes non-fatal events (e.g., recurrent stroke). If the composite matters, use Fine–Gray subdistribution hazards or cause-specific hazards — and say which. Treating death as censoring in a recurrence analysis biases estimates.

## Sample size

EPV counts *events*, not patients (ch02). A cohort of 2,000 with 40 deaths cannot support 16 parameters without penalization.

## Anti-patterns

- Median-splitting survival time or using "mean survival" with heavy censoring.
- Ignoring the PH assumption after a significant Schoenfeld test.
- Censoring deaths in a non-fatal-event analysis.
- Reporting C-index without the horizon or the censoring distribution.
- Apparent (in-sample) C-index as the performance claim.
