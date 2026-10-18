# ch20 — Radiology (RSNA) Submission

Target journal: *Radiology* (pubs.rsna.org). Requirements below are from the
RSNA author instructions; verify against the live instructions page before
submission because limits change.

## Figures

- **Accepted formats: TIF, EPS, AI, or PSD at 300 dpi. PNG is not accepted.**
  Use `templates/figures.py`: `save_draft()` (PNG) while iterating,
  `save_final()` (300-dpi TIFF + vector PDF) once the figure set is frozen.
- **New submissions:** combine all figures into one Word document, one per
  page, in order of citation, with the legend immediately after each figure.
  For revisions, upload figures individually as TIF/EPS files.
- **Multipart figures:** at most 4 components (a, b, c, d) per figure,
  combined on the same page. `figures.new_figure()` enforces this limit and
  adds the panel labels.
- **Sizing:** single column ≈ 3.35 in (8.5 cm), double column ≈ 7.0 in
  (17.8 cm). Both are preset in `figures.py`.
- Legends: define every abbreviation used in the figure or legend; no
  redundant figures. Keep the figure count within the article-type limit
  (e.g., *Radiology: Artificial Intelligence* allows 6 figures, 4 tables).
- Do not restate conclusions inside the figure; the plot carries the data,
  the legend and text carry the interpretation.

## Reporting checklist

- Prediction-model manuscripts must follow **TRIPOD+AI** (27-item checklist,
  Collins et al., BMJ 2024), which supersedes TRIPOD 2015. Generate the
  coverage report from the decision trace with `templates/tripod_check.py`,
  then complete the manual items (title, abstract, background, discussion)
  by hand.
- State explicitly whether the study is development, validation, or both
  (item 4), and flag discovery-only results — a model without external
  validation is a development study, whatever the internal AUC.

## Script and project organization (TRIPOD+AI item 27)

Every reported number must be traceable to a script and a decision trace.
Use this layout for the analysis repository:

```
project/
  scripts/          numbered, versioned analysis scripts (01_describe_v2.py)
  figures/
    drafts/         PNG while iterating (never submitted)
    final/          300-dpi TIFF + PDF companions, frozen set
  traces/           decision-trace JSONs, one per analysis
  output/           tables and metrics with CIs
  data/             never edited in place; document provenance in the trace
```

Rules:

1. **Version scripts, never overwrite.** A change to an analysis produces
   `*_v2.py`; the old version stays. The manuscript cites the version that
   produced each number.
2. **One decision trace per analysis.** The trace records seed, software
   versions, and every threshold — save it in `traces/` alongside the script.
3. **Figures are regenerated, never hand-edited.** A figure that needs a
   cosmetic change gets a code change and a rerun.
4. **Data files are read-only.** Preprocessing writes derived files; the
   trace records the source and date of every input.
5. **Report the environment.** The trace's `environment` entry (Python and
   package versions) satisfies TRIPOD+AI item 27; include it in the
   supplement.
