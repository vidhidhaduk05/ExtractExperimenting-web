# Decision log

Memory for later agents. Read this before changing search, screening, extraction, synthesis, or risk-of-bias behavior. Append a dated entry when a decision is made. Chat history is not this log.

## 2026-10-09 — Pure arterial malformation protocol

Source file: `d:\Desktop\Pure Arterial Malformation\PAM_Systematic_Review_Protocol_V2.docx`. A new project starts empty. Do not run `seed.py` or `seed_pam_protocol.py`; that codebook is an older schema and does not match Protocol V2.

- Load the protocol through the app extractor. It is a descriptive case-level review. Case reports are included. All languages are included. Do not apply the old default exclusions `case_report` or `non_english`.
- Search again from the protocol strings. Do not lock the protocol's earlier 28 studies or 74 patients.
- PubMed is searched with paging and the search-header window 1960-01-01 through 2026-08-31. The eligibility text also says no date restriction; that conflict stays logged, and the executed window is the search header.
- OpenAlex stands in for Scopus and Web of Science, which have no API here. Ovid MEDLINE is logged as not executed. Quoted phrases inside an AND clause are not searched on their own.
- Synthesis for this protocol is Wilson 95% intervals for proportions and median/IQR. Do not impute NR.
- If the LLM at `LLM_BASE_URL` (default `http://127.0.0.1:8081/v1/chat/completions`) is down, stop before screening. Do not invent include or exclude decisions.
- Protocol V2 names no RoB 2, ROBINS-I, or GRADE tool. Leave `auto_rob_enabled` off for this project. Do not force a risk-of-bias tool onto the case-report cohort.

## 2026-10-09 — robvis for risk-of-bias figures

[robvis](https://github.com/mcguinlu/robvis) (MIT) draws the publication traffic-light and summary bar figures for assessments the platform already stores.

- Supported templates: RoB 2, ROBINS-I, ROBINS-E, QUADAS-2. NOS has no robvis template.
- Plot script: `radextract_platform/backend/r_scripts/robvis_plot.R`. Install with `Rscript r_scripts/install_robvis.R`, which runs `remotes::install_github("mcguinlu/robvis")`.
- API: `GET /api/rob/projects/{id}/figure?plot=traffic|summary`. The RoB summary page shows both figures. The existing in-app traffic-light table remains.
- This is a figure layer. It does not choose a risk-of-bias tool for a protocol that never named one.

## 2026-10-09 — Study-specific RoB classification and export package

- RoB instruments are selected per study from parsed article evidence, not once per project. Selection is constrained to RoB 2, ROBINS-I, ROBINS-E, QUADAS-2, NOS, JBI Case Report, and JBI Case Series.
- A classification below the project's confidence threshold is stored in the manual-review queue. Never silently substitute ROBINS-I for an unknown design.
- Case reports and case series use the corresponding JBI critical-appraisal checklist. JBI item responses are exported without inventing a Cochrane-style overall risk judgment.
- Project summaries and figures are grouped by the assessment's stored tool. Do not combine incompatible domains or judgment scales in one robvis figure.
- The complete export is a ZIP containing per-tool Excel sheets, SVG/PNG figures, a separate MTR/RC reporting-completeness workbook and figure, and a JSON manifest.
- MTR/RC is a reporting-completeness profile, not a risk-of-bias instrument. Keep it labeled and aggregated separately.

## 2026-10-11 — TypeSafe Jev for screening

- For study eligibility screening (title/abstract and full-text), always enable and use TypeSafe Jev (`JEV_MODE=on`, `settings.jev_mode = "on"`).
- Fallback semantics: In case of temporary Jev API failure or circuit breaker trip, fallback to the standard LLM screening route is preserved so jobs do not break unexpectedly.

## 2026-10-11 — Local Laya adoption for screening

- Cloned `receptron/laya` into workspace (`./laya`) and downloaded ONNX weights (`laya/models/`).
- Added Python native engine [`laya/laya_engine.py`](file:///d:/Desktop/Rad%20Extract%20Experimenting/laya/laya_engine.py) using `onnxruntime` and `tokenizers`.
- Integrated local Laya engine into [`radextract_platform/backend/services/jev_client.py`](file:///d:/Desktop/Rad%20Extract%20Experimenting/radextract_platform/backend/services/jev_client.py) as the primary provider (`settings.jev_provider = "laya"`), eliminating cloud API keys and latency while preserving full contract compatibility with TypeSafe Jev schemas and LLM fallback.
