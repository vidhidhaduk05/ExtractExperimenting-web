# Ch 19 — Presenting Prediction Models

**Source basis:** Steyerberg, *Clinical Prediction Models* 2nd ed., ch18.

## Prediction model ≠ decision rule

A **prediction model** estimates absolute risk from patient characteristics; interpretation and action are left to clinician and patient. A **decision rule** suggests a specific course of action depending on the characteristics — it requires additional subject-matter input, especially a defensible cutoff (ch12's decision-curve thresholds). Presenting a model as a decision rule without the clinical groundwork conflates the two; label which one you are delivering.

## Absolute risk needs a baseline

Tables of ORs/HRs with CIs — the default epidemiological presentation — are **not sufficient to calculate absolute risks**. Absolute risk requires the baseline: the model intercept (binary/continuous) or baseline hazard (survival). When presenting a model for clinical use, report the baseline explicitly, or provide a formula/tool that computes absolute risk directly.

## Format inventory (match to audience)

| Format | Pros | Cons |
|---|---|---|
| Regression formula | Simple, follows directly from the analysis | Hard to compute by hand; CIs awkward |
| Spreadsheet | Exact calculations, familiar software | Requires opening a file |
| Web application | Easy access, exact calculations | Case storage/privacy considerations |
| Nomogram | Paper-based, exact, standard in some fields | Training needed to read |
| Score chart (points) | Compact, memorable | Continuous predictors are awkward; simplification loses information |
| Simplified table / risk groups | Very accessible | Coarse; hides within-group variation |
| Graphs (risk vs predictor) | Good for one continuous + few categorical predictors | Limited dimensions |

- **Score charts built from ORs are a known error**: adding odds ratios as if they were linear score contributions distorts the sum when ORs differ in magnitude — derive points from regression coefficients on a common scale instead.
- **Do not categorize** continuous predictors for presentation convenience (ch05, ch06); use graphs or exact-calculation formats.
- Some formats are field standards (nomograms in prostate cancer, survival curves by period in oncology) — match your field's expectations.
- Computerized presentation is the direction of travel (EHR-integrated prediction); for ML/AI models, **transparency is the sticking point** — proprietary models that obstruct assessment of generalizability conflict with the TRIPOD+AI reporting ethos (ch15).

## Practical checklist for a paper

1. State whether you deliver a prediction model or a decision rule.
2. Provide at least one exact-calculation format (formula, spreadsheet, or code) with the baseline risk.
3. Provide one accessible format (graph, table, or score chart) for the target audience.
4. Show predictions across a realistic patient profile range, with uncertainty where computable.
5. Deposit the runnable model (code + coefficients + baseline) — the decision trace and templates make this automatic.

## Anti-patterns

- OR tables presented as if they enabled absolute-risk calculation.
- Score charts summing odds ratios.
- Categorizing continuous predictors "for ease of use".
- A "web calculator" that stores patient data without governance consideration.
- Presenting a decision rule's cutoff as if it were model output rather than a choice (ch12).
