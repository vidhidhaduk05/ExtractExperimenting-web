# Homepage review — 25 October 2026

Independent visual critic; one production homepage, desktop and simulated mobile. Estimate, not affiliated with Awwwards. Evidence: shots/report.json, screenshots in shots/, and audit-summary.txt. Search results, destination pages, filters, mobile menu behavior and complete workflows were not verified.

The critic read the site as a careful clinical research studio with a question-first gateway to evidence mapping.

| Criterion | Score | Evidence |
| --- | ---: | --- |
| Design | 7.0 | d-01-hero: coherent plum/ivory identity; d-02 through d-04: repetitive bordered cards and centered sections. |
| Usability | 5.5 | mobile.vitals.lcpMs 19024; no overflow; contrast and skip-link issues. |
| Creativity | 6.0 | Evidence map described in d-03 rather than demonstrated. |
| Content | 6.5 | Research-specific copy, but internal engine terminology precedes example output. |

Weighted critic score: **6.3/10**. Indicative jury estimate about **7.4**, using the skill's +1.1 calibration from only two prior winner sites; this is not an award prediction.

| Developer area | Score | Evidence |
| --- | ---: | --- |
| Semantics/SEO | 4 | Missing description and initial semantic content; rendered h1 exists. Brand/title mismatch. |
| Animation | 6.5, partial | Three hover targets respond; reduced motion stays still; page transitions unverified. |
| Accessibility | 5 | One serious contrast rule affects 16 elements; no first-focus skip link. |
| Performance | 3 | Simulated mobile LCP 19.024 s, CLS 0.064; audit estimates 890 KB gzip JS and 1948 KB fonts. Local lab result, not field performance. |
| Responsive | 7 | No overflow; footer targets only 20 px high. |
| Metadata | 3 | Missing description and social-preview metadata. |

Proposals, pending user approval:

1. Reduce initial font and JavaScript cost; repeat lab measurements after any change.
2. Improve muted-text contrast, target sizes and keyboard entry.
3. Show an annotated evidence-map example, with sources and limitations.
4. Resolve Stellar Labs / RadExtract naming and add metadata.
5. Tighten mobile spacing and repeated copy.

User direction: preserve current editorial serif typography, plum/ivory palette and overall identity. Main action: explore evidence for a research question. Hermes is an aesthetic reference; Phylo is a use-case organization and scroll-animation reference. Approval required before implementation. Frontend only.

The production build issued failed health requests to an unavailable API hostname; backend operation and its effect on research workflows remain unverified.
