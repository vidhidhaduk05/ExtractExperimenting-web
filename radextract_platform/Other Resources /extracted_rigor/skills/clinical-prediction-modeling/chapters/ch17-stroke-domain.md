# Ch 18 — Stroke Domain Notes

**Source basis:** standard stroke research practice. Domain knowledge to pair with the methods chapters.

## Core instruments and their modeling implications

- **NIHSS (0–42):** ordinal, right-skewed, non-interval. Model as spline or ordinal; common dichotomies: ≥6 (moderate), ≥16 (severe). Never treat as a clean linear covariate without checking.
- **mRS (0–6):** ordinal outcome. Standard dichotomies: 0–2 vs 3–6 (poor outcome), 0–3 vs 4–6 (very poor), death (6). Sliding dichotomies and ordinal (proportional-odds) models are alternatives — pre-specify.
- **ASPECTS (0–10):** bounded ordinal imaging score; low scores are sparse — collapse (e.g., <8 vs ≥8) or spline with care.
- **mTICI (0–3):** reperfusion grade; eTICI 2b50/2c/3 distinctions matter in modern cohorts. Model as ordinal or collapsed (successful reperfusion = 2b50+).

## Imaging predictors

- **NWU (net water uptake):** CT attenuation-derived edema measure; admission NWU ~6–7% typical. Hemorrhagic transformation raises attenuation and biases NWU — a sensitivity analysis excluding hemorrhage is standard practice.
- **CTP-derived:** rCBF, rCBV, Tmax, mismatch/core volume. Highly correlated — penalize or collapse (ch05, ch10). Core volume is right-skewed: log or spline.
- **Time metrics:** LKW-to-imaging, door-to-groin — frequently missing (often >20%) and outcome-associated; prime MI candidates (ch03).

## Recurrent stroke-prediction pitfalls

- **Post-treatment variables in admission models:** 24-hour imaging cannot inform admission decisions.
- **Serial-measurement composites:** admission + increment = follow-up value; check the reparameterization before claiming both add value (ch06).
- **Center effects:** multi-center stroke cohorts have strong center effects (protocol, population); random intercepts or center adjustment, and internal-external validation across centers (ch09, ch11).
- **Hemorrhage transformation** as both effect modifier and measurement bias — handle explicitly.
- **Outcome-associated missingness** is the norm (sicker patients get fewer measurements) — complete-case is a selection decision (ch03).

## Common stroke prediction targets

90-day mRS/death, symptomatic ICH (sICH per ECASS/Heidelberg definition — state which), malignant edema, recanalization status, post-thrombectomy edema progression. Each has standard covariate sets (age, sex, NIHSS, glucose, SBP, ASPECTS, location, mTICI, time metrics) — start from them, justify additions.

## Reporting conventions

Report medians [IQR] for skewed variables, n (%) for categorical; AUCs with CIs; adjusted ORs per natural unit; state the mRS cut and the sICH definition in the abstract.
