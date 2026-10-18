# Ch 21 — Methodology Prompt Generation & the Temporal-Alignment Lock

**Source basis:** ch01 (predictor availability), ch03, ch11, ch12, ch15; the NWU-CTP
re-analysis case study (2026), in which a published paper's central claim failed because
one analysis served two decision points.

## Why this chapter exists

A real two-center stroke paper asked two questions — (1) tissue fate after reperfusion
is known, and (2) 90-day outcome before reperfusion is known — but ran one analysis that
used mTICI to select the CTP map and then presented the result as a pretreatment
predictor. The predictor set was misaligned with the decision point, and no amount of
validation machinery (5-fold CV, bootstraps) could repair a model built on the wrong
variables. Prose rules ("use only predictors available at the intended time of use")
did not prevent this. Prevention requires a **lock**: a declared decision point per
question, a predictor-timing audit against it, and a forbidden list — all before any
modeling, all logged in the decision trace.

## The Temporal-Alignment Lock (run before any modeling)

For EVERY question the analysis will answer:

1. **Declare the decision point** — the moment and setting at which the model would be
   used (e.g., "admission CT, before thrombectomy" vs "post-procedure, mTICI known").
2. **Inventory every candidate predictor's availability time** — measured-or-derivable
   strictly BEFORE the decision point, or not. Derived quantities inherit the latest
   input time (a score computed from follow-up imaging is a follow-up variable).
3. **Write the forbidden list** — variables that define or reveal the future state
   (e.g., mTICI, 24-hour follow-up infarct volume, any formula whose coefficients
   change with a post-decision outcome such as reperfusion grade).
4. **Audit the model spec against the list** — including conditional structures: a
   model that changes its inputs based on a post-decision variable is a post-decision
   model, whatever its label.
5. **Log the lock** in the decision trace: decision point, allowed predictors,
   forbidden predictors, and the audit result. A model that violates its own lock is
   invalid regardless of performance; it must be relabeled (different decision point)
   or dropped.

Post-decision information may be used in exactly two ways, both labeled:
- **Oracle/sensitivity model** — bounds how much the future information would add;
  explicitly not for intended use.
- **Separate conditional aim** — a different question with its own later decision
  point, reported as such (e.g., tissue-fate estimation after reperfusion is known).

## Generating a methodology prompt

Use `templates/prompt_generator.py` or the template below to produce a frozen,
explicit methodology prompt for the analyst/agent. The generated prompt is presented
to the PI for approval (Approval Gate) BEFORE execution.

Generation workflow:
1. Collect metadata: questions (each with its decision point), cohort description,
   candidate predictors with availability times, outcome definitions, center structure,
   target journal, compute budget.
2. Run the Temporal-Alignment Lock per question; attach allowed/forbidden lists.
3. Emit the prompt: questions → sample-size/Riley feasibility → missing data (MICE
   inside resamples) → functional form (splines by default, tested) → outcome models →
   center handling → validation design (stratified full-pipeline OOB bootstrap with
   paired differences; leave-one-center-out both directions; three metric families +
   decision curves) → design rules → reporting standards (TRIPOD+AI, terminology,
   signs preserved) → deliverables.
4. The prompt must always include: the approval gate, the interpretation rules
   ("no detectable difference" never "equivalent"; negative results reported as
   prominently as flattering ones; all signs kept), and the deliverables contract
   (frozen plan, machine-readable outputs, figures, self-written limitations).

## Canonical prompt template

```
Reanalyze <COHORT DESCRIPTION> to answer the following questions as rigorously as
current prediction-model methodology allows. Justify every methodological choice in
writing, separate design decisions made BEFORE seeing outcomes from choices made after,
and follow the interpretation rules at the end.

APPROVAL GATE
Present a frozen analysis plan (cohorts, imputation, splines/features, model forms,
validation design, metrics, primary comparisons) and WAIT for approval before
executing. Log every approved choice and its alternatives in a JSON decision trace.

QUESTIONS
<Q1: ... Decision point: <TIME/SETTING>. Allowed predictors: <LIST>. Forbidden: <LIST>.>
<Q2: ...>

TEMPORAL-ALIGNMENT LOCK (per question)
- Decision point declared; every candidate predictor inventoried by availability time;
  forbidden list written; model spec audited against it — including conditional
  structures that change inputs based on post-decision variables. Log the lock.

SAMPLE SIZE AND FEASIBILITY
- Events per PARAMETER (spline = knots-1 parameters; k-level categorical = k-1).
- Riley/pmsampsize criteria: shrinkage >= 0.9, optimism in Nagelkerke R² <= 0.05,
  intercept margin <= 0.1. Reduce parameters if unmet; log the computation.
- Low-event subgroups: state what can/cannot be estimated; label exploratory.

MISSING DATA (default MICE inside every resample)
- Characterize missingness overall/by center; compare completers vs non-completers on
  the outcome; complete case is a selection decision, reported as sensitivity.
- m >= 20 datasets; outcome included in imputation models; fit inside every training
  resample; apply fitted models to out-of-bag patients; never impute once upfront.
- State the MAR assumption and its plausibility.

FUNCTIONAL FORM (splines by default, tested)
- Restricted cubic splines (4-5 knots) by default for continuous/ordinal predictors;
  keep linear only where an LR test shows no gain; report the test. Penalize or
  collapse correlated predictors.

OUTCOME MODELING
- Pre-specify the primary outcome cut; pre-specify ordinal/shift secondary models with
  assumption tests.

CENTER
- Per-center n, events, internal performance; pooled primary; center-covariate and
  hierarchical-pooling sensitivities.

VALIDATION DESIGN (mandatory)
A. Stratified full-pipeline out-of-bag bootstrap (>=500 replicates continuous outcomes,
   >=200 binary; record seed): refit everything inside each resample; evaluate on
   out-of-bag patients; percentile intervals; ALL comparisons as paired differences on
   the same replicates; optimism-corrected framing for headline models.
B. Leave-one-center-out both directions with full refit; report AUC/Brier/calibration
   per direction with test-set n and events; label a two-center swap a transportability
   STRESS TEST, never external validation; discovery-only without an external cohort.
C. Three metric families on the same replicates: discrimination (AUC + paired
   differences), calibration (intercept, slope, decile plot — report overfitting
   honestly), Brier; plus decision curves (net benefit vs treat-all/treat-none across a
   stated plausible threshold range). For continuous outcomes: OOB R²/MAE/RMSE/bias
   with ALL signs preserved — never clip at zero or take absolute values.

DESIGN RULES (non-negotiable)
- Each model uses only predictors allowed by its temporal-alignment lock. Post-decision
  information appears only in labeled oracle/sensitivity models or as a separate,
  later-decision-point aim.
- No data-derived thresholds; supplemental sens/spec/PPV/NPV only at literature-
  precedented cut-points, cited.
- Pre-specified sensitivities: clinically indicated subgroup exclusions (e.g.,
  hemorrhagic transformation when NWU is densitometric), complete case vs MI,
  transformed volumes.
- Report unflattering results as prominently as flattering ones.

REPORTING STANDARDS
- TRIPOD+AI checklist from the decision trace; STROBE for the cohort.
- Name every perfusion/imaging measure explicitly; univariable/bivariable, not
  unimodal/multimodal; state outcome cuts in the abstract.
- Report replicate counts, hyperparameter distributions, seed, software versions.

DELIVERABLES
- Frozen approved plan; executed results with deviations flagged.
- Cohort flow with exact counts and per-variable missingness, overall and by center,
  plus completers-vs-non-completers comparison.
- Machine-readable CSV/JSON: bootstrap summaries, paired differences, center-held-out
  results, calibration, decision curves, hyperparameter traces, seed, versions.
- Figures: flow diagram, design schematic, outcome scatterplots (linear axes, identity
  line), ROC AND calibration plots, decision curves, center-held-out forest plot.
  300-dpi TIFF finals + PNG drafts at journal column widths; colorblind-safe palette;
  no interpretive annotations inside panels.
- An honest limitations section written by the analyst, unprompted.
```

## Acceptance check for any generated prompt

- Every question has a declared decision point and a forbidden-predictor list.
- The validation section specifies stratification, full-pipeline refit, OOB evaluation,
  paired differences, replicate counts, and seed.
- Signs-preserving language is present (no "absolute value", no "clip at zero").
- The approval gate precedes execution.
- The interpretation rules are included verbatim.
