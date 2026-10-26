# Stellar Labs — Master Theme

Updated: 26 October 2026 (Asia/Calcutta)
Status: Current user-approved preferences for the separate working frontend.

## Authority and scope

Read this file before editing either working page. It supersedes older font and color guidance in Editorial Velvet.md, editorial-polish.css, question-bar.css, and earlier prototypes. Explicit later user instructions take precedence. The working HTML files are the visual reference; inspect their final computed styles because earlier CSS blocks contain superseded values.

Work only on the frontend. Preserve the user's existing design, content, sections, interactions, and visual identity. Make focused changes; do not replace the landing page, remove the notebook, or introduce a new design direction without an explicit request. Use cases may be moved only where the user has authorized it. Preserve placeholders for content the user will supply later.

## Files and editing workflow

All paths below are relative to `D:\Desktop\Website Updated`.

| File | Purpose |
| --- | --- |
| `Stellar_Labs_landing_working_copy.html` | Editable landing page and approved visual reference |
| `ClaimScape_working_copy.html` | Generated standalone ClaimScape preview; rebuild from source |
| `ClaimScape/src/pages/ClaimscapePage.tsx` | Editable ClaimScape page |
| `ClaimScape/src/components/claimscape/` | Map, paper inspector, methodology components |
| `ClaimScape/src/index.css` | ClaimScape styles, embedded fonts, current theme overrides |
| `ClaimScape/tailwind.config.js` | Supporting Tailwind configuration; older font defaults may be overridden by current CSS |
| `ClaimScape/build.cjs` | Builds the standalone preview |
| `fonts/` | User-selected font assets |
| `MASTER_THEME.md` | Canonical preference and theme record |

Keep the original landing HTML and the main application repository untouched unless the user explicitly asks for integration. The integration destination, when requested, is `D:\Desktop\Rad Extract Experimenting\radextract_platform\frontend`.

From `ClaimScape`, run `npm install` once if dependencies are unavailable, then `npm run build`. The build generates `../ClaimScape_working_copy.html`. The current local workflow can reuse existing dependencies through NODE_PATH; do not require that machine-specific path in a portable installation.

Do not rebuild from old export scripts or backups: they can overwrite approved source changes. Preserve the current source as the implementation reference. Save a dated backup before substantial work and avoid accumulating conflicting active style definitions.

## Brand and audience

Name: Stellar Labs. Voice: refined academic editorial, warm, precise, curious, and credible. Audience: professors, radiologists, and clinical researchers worldwide. Primary task: explore evidence for a research question.

Radiology comes first, with broader clinical research examples retained. The user likes the existing page and wants it elevated rather than redesigned. Phylo/Biomni informs use-case clarity and restrained scroll motion; it is an inspiration, not a replacement identity.

## Typography

| Role | Current font | Rules |
| --- | --- | --- |
| Headings, display titles, brand wordmarks | **Serifon Editorial** | Use the supplied Regular and true Italic files. Preserve existing size and weight hierarchy. |
| Question/claim entry, radiology question callouts, topic buttons | **Serifon Editorial** | Same display family; retain readable sizes and existing interaction behavior. |
| Main body text and reading copy | **QuadraatSmallCaps** | The supplied file is specifically the small-caps cut, not regular mixed-case Quadraat. |
| ClaimScape synthesized map headline | **QuadraatSmallCaps** | Explicit user-approved exception; retain `#synthesized-map-headline` in the body family. |
| Controls, labels, instructions, metadata | **Work Sans** | Keep inputs for PubMed query, functional buttons, and controls clear. Topic buttons are the approved Serifon exception. |
| Code, queries and technical values | Existing monospace where explicitly styled | Do not turn every field into display typography. |

### Font assets

- `fonts/TheSerifonEditorialRegular-G3dBy.otf` — normal, weight 400.
- `fonts/TheSerifonEditorialItalic-j9gYj.otf` — italic, weight 400.
- `fonts/QuadraatSmallCaps.ttf` — normal, weight 400.

Use `format('opentype')` for the OTF files and `format('truetype')` for the TTF file; `format('ttf')` is incorrect. Use `font-display: swap`.

The two previews embed the font bytes so they open directly from disk. For React integration, copy the font assets into the frontend's font directory and register them with `@font-face`; match the appearance before removing embedded copies.

Only Regular and Italic Serifon files are currently supplied. Do not claim that a separate Bold or variable font has been installed. Existing heavier weights may be synthesized by the browser. Preserve italic accents and existing capitalized labels; do not uppercase every heading or change copy globally.

Silver Editorial was explored earlier but was not installed. **Serifon Editorial is the current heading choice.** Bodoni Moda and Newsreader are fallbacks, not the preferred theme fonts.

```css
:root {
  --font-heading: 'Serifon Editorial', 'Bodoni Moda', Georgia, serif;
  --font-body: 'QuadraatSmallCaps', 'Newsreader', Georgia, serif;
  --font-ui: 'Work Sans', system-ui, sans-serif;
}
```

The user has specified personal use for these local previews. Retain the downloaded font notices with the assets; public release is a separate step.

## Colors

| Role | Hex | Usage |
| --- | --- | --- |
| Primary wine | **`#3a0f34`** | Exact required top-bar background; primary ink, buttons, footer |
| Deepest plum | `#1a0017` | Existing darkest accent/hover where appropriate; **not the top-bar background** |
| Paper | `#fbf9f4` | Main canvas, cream closing band, light text on wine |
| White | `#ffffff` | Question card and selected content surfaces |
| Editorial plum | `#814d75` | Italic accents, secondary emphasis, focus details |
| Muted plum | `#66365c` | Secondary editorial emphasis |
| Main reading ink | `#4f444b` | Body text |
| Secondary ink | `#62535d` | Descriptions and labels |
| Quiet ink | `#72636d` / `#81737b` | Existing tertiary copy; retain adequate contrast |
| Border | `#d2c2cb` | Thin card and control outlines |
| Soft plum field | `#eee7ec` | Reading-room section and first closing band |
| Ochre | `#7c5800` | Sparse editorial accent |
| Pale amber | `#ffdea6` | Topic hover, selection, notebook accents |
| Notebook blue-gray | `#dde3e8` | Existing note surface |
| Notebook pale plum | `#eadce6` | Existing note surface |
| Notebook cream-gray | `#e4e2dd` | Existing note surface |

Preserve ClaimScape's existing evidence-map colors and legends. Color coding carries meaning; do not recolor verdicts or study-design encodings as a decorative theme pass.

## Header

- Slim wine bar with light text; background exactly `#3a0f34`.
- Keep the Stellar Labs mark, wordmark, navigation, and actions.
- Current inner heights: 56 CSS px desktop/tablet and 52 CSS px at widths up to 600 px. Existing page scaling may affect measured rendered height.
- At widths up to 1100 px, use the hamburger/menu rather than squeezed or wrapped desktop navigation.
- Mobile menu uses the same wine color. Keep visible keyboard focus and readable light text.

## Landing page and question card

- Preserve “Stay curious. See what the evidence says.” on the landing page.
- Keep the centered white question card, serif question entry, fine plum border, and wine action button.
- Search options are **always visible**. No dropdown, disclosure triangle, or collapsible Search options heading.
- Keep the positive-statement guidance and Enter/Shift+Enter instructions.
- Include editable auto-built PubMed query, reset-to-auto action, 100/200/300 paper choices, and the narrative-review/commentary checkbox.
- Keep control text readable, generally 14 px, with restrained spacing. Current card padding is approximately 20 × 24 px desktop and 16 px mobile; controls use roughly 10–12 px vertical spacing.
- Manual query edits must survive question edits. Choosing an example or resetting may restore automatic query generation.
- Study-type and publication-date filters and their Filters button were explicitly removed. Do not reintroduce them.
- Topic chips stay outside the card and match ClaimScape's topic section.
- Keep the seven approved examples: Breast imaging, Stroke imaging, Chest imaging, Sleep & memory, Cardiovascular health, Mental health, Cancer vaccines.

### Radiology-first questions

1. How does AI-assisted mammography compare with standard screening?
2. How do CT perfusion and MRI compare in acute ischemic stroke assessment?
3. What predicts malignancy in incidental pulmonary nodules?

Prioritize these as suggestions while preserving the broader examples. Keep the reading-room section and radiology reminders on the notebook: patient-level versus lesion-level, reference standard, external validation, and impact on management. These are research prompts, not claims of established findings.

## Notebook and use cases

- Preserve the draggable notebook, its original notes, and the Roosevelt quote note.
- Keep its loose, tactile arrangement; do not replace it with rigid cards or remove it during a styling pass.
- Preserve the existing carousel and other established landing sections.
- The 01 Observe, 02 Placeholder, and 03 Question blocks were moved into the separate use-case gallery with user approval. Leave placeholders in their former Approach positions for future content.
- Retain the reading-room examples and the illustrative imaging-study appraisal guide. Do not invent study results, endorsements, metrics, or clinical performance claims.

## Closing sections and footer

- Three full-width closing color fields: soft plum (`#eee7ec`), cream (`#fbf9f4`), then wine (`#3a0f34`).
- Preserve FAQ, contact copy, email form, existing navigation links, and legal copy.
- The cream contact band uses an editorial two-column composition on desktop and stacks on mobile.
- Footer “Stellar Labs” is intentionally oversized: current desktop maximum 148 px, responsive on smaller screens. Keep the wordmark prominent without clipping or horizontal overflow.

## ClaimScape-specific preferences

- Preserve the introductory paragraph beginning “Type a claim and see where the literature stands on it.”
- Preserve the three explanations: each dot is a paper; rows represent study designs with verdicts and Wilson intervals; dots open their supporting sentence.
- “Stay curious. See what the evidence says.” was removed from **ClaimScape only**. Do not restore it there.
- The selected “Evidence Mapping Framework: Dual-prompt stance verification…” footer sentence was removed. Retain the rest of the methodology and provenance content.
- Match the landing page's visible query controls and seven topic chips. Keep the existing map action and progress behavior.
- Retain Quadraat for the synthesized map headline even though other headings use Serifon.
- Preserve evidence calculations, study classifications, map interaction, inspector, and data behavior. A visual update is not permission to change scientific logic or backend services.
- Preserve the original example dataset's identity. Do not relabel its hormone-therapy evidence as radiology evidence when changing example prompts.

## Layout, motion, and accessibility

- Refined academic editorial; paper fields, wine typography, thin outlines, sharp corners.
- Avoid generic gradients, rounded dashboard cards, heavy effects, or unrelated brand elements.
- Use comfortable reading widths and clear hierarchy. Reduce excess question-card spacing while keeping controls legible and touchable.
- Keep existing motion restrained and meaningful. Honor reduced-motion preferences, avoid hiding essential content behind animation, and preserve notebook interaction.
- Verify keyboard focus, labels, Enter-to-submit, Shift+Enter, and radio/checkbox interaction.
- Check at approximately 1440 px desktop, 903 px intermediate, and 390 px mobile. No clipped wordmarks, overlapping controls, or horizontal overflow.

## Verification and future updates

1. Inspect current files and relevant repository instructions before editing.
2. Make the smallest scoped frontend change requested.
3. Rebuild ClaimScape when its source changes; do not hand-edit its bundled HTML.
4. Verify actual font loading, normal/italic faces, screenshots, responsive layout, and the affected interactions. A CSS family name alone does not prove the font loaded.
5. Confirm preserved content and explicit exceptions above.
6. Update this master guide when the user approves a new preference. Note the date and the superseded value. Do not silently revive older theme definitions.

## Frontend integration handoff

Use the two working HTML files as the approved visual reference. Convert the landing HTML into React components and use ClaimScape's editable React source. Copy/register the supplied fonts. Preserve page content, notebook, radiology examples, controls, instructions, and the exact header color. Integrate into the main frontend only when requested, without redesigning it or changing backend/search/scientific behavior. Verify desktop/mobile parity and leave these reference copies intact.

## 26 October 2026 — Lenis integration

The separate landing working copy now embeds Lenis 1.3.27 for wheel scrolling and existing section anchors. It uses autoRaf, lerp 0.1, native touch (syncTouch false), and the existing anchor handler. Native scrolling remains active for reduced-motion users and within form controls, the notebook, and the carousel. Runtime preference changes destroy/recreate Lenis. Vendor assets and the MIT notice are retained in assets/vendor/lenis/. Do not edit or push to the upstream Lenis repository. ClaimScape remains unchanged.

## 26 October 2026 — Rhythmic section reveals

The landing working copy now reveals headings, supporting copy, and cards in short sequences as they enter the viewport. Default lift: 26 px, duration: 660 ms, beat: 90 ms, easing: cubic-bezier(.22,1,.36,1). Mobile: 16 px / 560 ms / 70 ms. Delay caps at three beats so fast scrolling does not create long queues. Notebook notes and the carousel use opacity-only entrances, preserving their existing positioning and transforms. Elements reveal once; focused controls become visible immediately. Reduced-motion users receive visible static content; runtime preference changes finish all reveals. The legacy fade/hero entrance rules are superseded while this motion layer is active. Embedded source copies are retained in assets/motion/rhythm.css and rhythm.js; preserve standalone HTML parity when updating them. ClaimScape is unchanged.

Motion detail: staggering restarts within each section. Groups containing links or form controls use opacity-only entrances so their pointer targets remain stationary during focus and clicks.

## 26 October 2026 — Spring settling and bounded edge resistance

The landing preview uses sampled damped-harmonic motion for noninteractive reveal lifts (mass 1, stiffness 270, damping 26). Existing stagger timing and stationary interactive fades remain. A separate RAF spring (stiffness 250, damping 29) handles top/bottom wheel resistance. Its hyperbolic displacement limit is 42 CSS px, with current position and velocity preserved on retargeting. A 110 ms inactivity timer detects wheel-gesture release; it does not drive animation. Native touch/pinch gestures, keyboard navigation, form fields, notebook, carousel and nested scrollers bypass the edge effect. Main and footer sit in a layout-neutral clipping boundary; their content/order remains intact. Reduced motion disables physical movement and native scrolling remains available. Sources: assets/motion/spring-motion.js, edge-motion.js, edge-motion.css and updated rhythm.js. ClaimScape is unchanged.

## 26 October 2026 — Radiology-only typewriter prompts

Both question-entry typewriter animations cycle only the three approved radiology examples already listed below the bar: AI-assisted mammography versus standard screening; CT perfusion versus MRI in acute ischemic stroke; and malignancy predictors in incidental pulmonary nodules. Keep broader topic buttons available. Never overwrite a visitor's text or animate while they are entering it.

## 26 October 2026 — Evidence-backed preset query scopes

The seven topic buttons use dedicated, live-verified PubMed queries rather than the full question stripped into keywords. Radiology labels and the three typing prompts stay unchanged. The exact question selects its curated query during example selection and auto-building; manual query edits still take precedence. Query mode identifies a preset query. Verification records and real sampled PMIDs live in presets/research-presets.json and presets/README.md, with the editable ClaimScape registry in src/data/research_presets.json. Counts are search matches, not analyzed/included papers. Do not force every evidence tier to contain papers or invent cached studies/verdicts for presentation. Existing backend and classification logic were not changed.

## Main frontend integration — 26 October 2026

The approved design is integrated into the React frontend. Landing markup is src/landing_body.html, route-scoped styles are src/landing.css, and mount/cleanup logic is src/pages/LandingPage.tsx. Typed motion modules are src/assets/motion/. ClaimScape route styles live in src/styles/approved-theme.css. Both pages share src/lib/researchPresets.ts and src/data/research_presets.json. Local font files are bundled from src/assets/fonts. npm Lenis is used without editing or pushing upstream. Existing API/scientific logic remains intact. The GitHub Pages build uses radextract_platform/frontend; the root src directory is a mirrored source snapshot.
