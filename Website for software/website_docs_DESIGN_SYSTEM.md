# MetaSynthesis AI — Design System & Project Context

Everything an LLM (or a person) needs to design and build additional pages that look, sound, and behave consistently with the shipped landing page at `version_1_website_MetaSynthesis.html`.

This document is the single source of truth. Use it as a system prompt when generating new pages; copy the markup patterns verbatim where possible.

---

## 0. Project Context

### What MetaSynthesis AI is

MetaSynthesis AI is an **in-development**, audit-first AI-assisted data-extraction tool for systematic reviews and meta-analyses. It is built by the **Curie Project** (founder: Dhaduk, V.).

Key product premises — these MUST shape every page's copy:

- **Targets, not claims.** No metric on the site is presented as a measured benchmark. The hero, the precision section, and the FAQ all label numbers as *aspirational targets* set against published literature. No fabricated accuracy numbers.
- **Human-supervised by design.** The tool is positioned as AI-assisted, human-verified. It is NOT marketed as a replacement reviewer, NOT marketed as a medical device, and explicitly aligns with Cochrane, JBI, and RAISE guidance.
- **Audit-first.** Every extraction is traceable to a sentence-level source. Dual-extractor + referee architecture. Append-only audited workbook.
- **TRIPOD-LLM forthcoming.** A prospective validation study is in preparation; no validation paper to cite yet. Do not write copy that implies one exists.
- **Honest about beta status.** Testimonials are bracketed placeholders. DOIs that haven't been verified are marked `[[ADD DOI]]`. Pricing tier features are listed but dollar amounts are hidden until the model stabilizes.

### Voice & tone

- **First-person from the founder** in the About section (`I built MetaSynthesis AI because...`). Everywhere else: third-person, plain, declarative.
- **No marketing puffery.** No "revolutionary," "game-changing," "unlock," "transform." If you can't justify it with a reference or a target, don't claim it.
- **Concrete examples over abstraction.** "Extracts PICO + demographics + statistical results into an audited workbook" beats "streamlines your research workflow."
- **Acknowledge limits inline.** If a section makes a forward-looking claim, the same paragraph (or the next) should say what's not yet validated.

### Three real audiences (write for these, in this order)

1. **Methodologists / research methodologists** — Cochrane / Campbell / JBI background. Will read the Evidence Board and the How-to-Cite section carefully. Tolerant of jargon (PICO, GRADE, TRIPOD-LLM, F1, κ).
2. **Clinician-researchers running their own reviews** — busy, want to see "is this safer than ChatGPT for extraction" answered quickly. Will skim hero, look at precision targets, jump to pricing.
3. **PhD students / RAs doing extraction work** — sensitive to cost. Will care about features-per-tier and whether the free tier covers a thesis.

Marketing leads, sales prospects, generic SaaS buyers — explicitly NOT the audience. Resist patterns from that world.

### Citations & references already used (real, verified)

Use these as the canonical bibliography for any new pages. Do not invent new ones.

- **Konet et al. (2024)** medRxiv preprint on AI-assisted data extraction — DOI verified, used in Evidence Board.
- **Sun et al. (2024) PLoS One** — extraction accuracy study, DOI verified.
- **Khraisha et al. (2023) BMJ Open** — automation in systematic reviews, DOI verified.
- **TRIPOD-LLM reporting guideline** (Gallifant et al., reference work — frame as forthcoming reporting standard).
- **Cochrane Handbook** (general reference, no specific DOI used).
- **JBI Manual for Evidence Synthesis** (general reference).
- **RAISE guidance** (AI in evidence synthesis — emerging consensus statement).
- **PRISMA 2020 statement**.

Six Evidence Board entries are intentionally marked `[[ADD DOI]]` because the original site cited papers that couldn't be verified; do NOT replace them with invented DOIs.

---

## 1. Design Tokens

These are real CSS custom properties declared on `:root`. Reuse them; do not invent new colors.

### Color palette

| Token | Hex / Value | Usage |
|---|---|---|
| `--beige-bg` | `#f4f1e6` | Default page background. The site's "paper" feel. |
| `--beige-card` | `#eae6d7` | Card / surface fill (one shade darker than bg). Used on the Precision section. |
| `--beige-hover` | `#e0dccf` | Hover state for beige surfaces. |
| `--beige-deep` | `#d5d0c3` | Deepest beige, used for dividers and emphasized borders. |
| `--ink-black` | `#0f0f0f` | Primary text. Buttons. Footer background. |
| `--ink-mid` | `#444` | Body paragraphs. |
| `--ink-light` | `#666` | De-emphasized text. |
| `--ink-muted` | `#888` | Eyebrow labels, captions. |
| `--ink-faint` | `#9c9487` | Placeholder text, very subtle hints. |
| `--divider` | `#d5d0c3` | Section divider lines. |
| `--border-soft` | `rgba(0,0,0,0.08)` | Card outlines. |
| `--border-mid` | `rgba(0,0,0,0.12)` | Button outlines, pills. |
| `--border-firm` | `rgba(0,0,0,0.20)` | Emphasized borders. |
| `--sage` | `#5B7553` | **Primary accent.** Links, eyebrow dots, focus rings, sub-section borders. |
| `--ochre` | `#B5764A` | Warm secondary accent. Use sparingly. |
| `--plum` | `#7B6B8A` | Used for italicized H2 phrases (`<span class="italic" style="color:var(--plum)">...</span>`). |
| `--amber` | `#C4924A` | Tertiary accent, paired with ochre. |
| `--note-sage` | `#c5cebd` | Tinted background for sticky-note-style callouts. |
| `--note-ochre` | `#dbc9a0` | Same. |
| `--note-plum` | `#c4b5c8` | Same. |
| `--note-cream` | `#e0dccf` | Same. Used in About → Curie Project sub-section. |

### Border radius scale

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | `4px` | Small chips. |
| `--radius-md` | `6px` | Cards, code blocks. |
| `--radius-lg` | `8px` | Header solid CTAs. |
| `--radius-xl` | `12px` | Primary `.btn-solid` and `.btn-outline`. |
| `--radius-2xl` | `16px` | Large hero / feature cards. |

### Typography (Google Fonts, already loaded)

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;1,8..60,400;1,8..60,500&family=Space+Mono:wght@400;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
```

| Helper class | Family | Where used |
|---|---|---|
| `body` (default) / `.font-body` | `'Source Serif 4', 'Source Serif Pro', Georgia, serif` | All running prose, paragraphs, hero subtitle. |
| `.font-heading` | `'EB Garamond', Georgia, serif` | All H2/H3 display type. H2 is **400 weight**, italic accents in `<span class="italic">`. |
| `.font-sans` | `'Inter', system-ui, sans-serif` | Buttons, nav links, tags, small UI. |
| `.font-mono` | `'Space Mono', monospace` | Eyebrows `[ 01 ]`, code blocks, tiny labels. |

Base body rule:
```css
body {
  font-family: 'Source Serif 4', 'Source Serif Pro', Georgia, serif;
  background-color: var(--beige-bg);
  color: var(--ink-black);
  overflow-x: hidden;
}
```

Base paragraph:
```css
p {
  color: var(--ink-mid);
  font-family: 'Source Serif 4', serif;
  font-size: 15px;
  line-height: 1.55;
  letter-spacing: -0.01em;
  max-width: 90%;
}
```

### Responsive breakpoints

Three min-width breakpoints + one max-width. Stay inside them:

| Breakpoint | Trigger |
|---|---|
| `@media (min-width: 640px)` | Tablet portrait — grid widens. |
| `@media (min-width: 768px)` | Tablet landscape — desktop nav appears, hamburger hides. |
| `@media (min-width: 1024px)` | Desktop — multi-column layouts engage. |
| `@media (max-width: 767px)` | Mobile-only overrides — hamburger menu visible. |

### Animations

Three named keyframes are defined; reuse them instead of inventing new motion.

- `@keyframes pulse-slow` — used on `.eyebrow-dot` (2s ease-in-out infinite).
- `@keyframes fadeUp` — used with the `.fade-up` utility for on-scroll reveal.
- `@keyframes noteWobble` — used on Evidence Board sticky notes.

The `.fade-up` utility starts at `opacity:0; transform:translateY(20px)` and is unfaded by JS via IntersectionObserver. **For new pages: add `class="fade-up"` to any element that should reveal on scroll, and optionally `d1`, `d2`, `d3` for staggered delay (those classes are defined inline in the CSS block).**

---

## 2. Section Architecture

### Page structure (top-to-bottom)

The landing page is a single-page scroll with this exact section sequence:

| # | id | Eyebrow | aria-label | Background |
|---|---|---|---|---|
| – | – | – | Hero | default `--beige-bg` |
| 01 | `features` | `[ 01 ]` Features | Features | default |
| 02 | `evidence` | `[ 02 ]` Evidence Board | Published research evidence | `--beige-bg` (explicit) |
| 03 | `use-cases` | `[ 03 ]` Use Cases | Use cases | default |
| 04 | `how-it-works` | `[ 04 ]` Process | How it works | `--beige-bg` (explicit) |
| 05 | `how-cite` | `[ 05 ]` How to Cite | How to cite | default |
| 06 | *(none)* | `[ 06 ]` Precision | *(none)* | `--beige-card` (explicit) |
| 07 | `pricing` | `[ 07 ]` Pricing | Pricing | default |
| 08 | `testimonials` | `[ 08 ]` Researchers | Testimonials | `--beige-bg` (explicit) |
| 09 | `about` | `[ 09 ]` About | About the founder | default |
| 10 | `faq` | `[ 10 ]` FAQ | FAQ | default |
| 11 | `waitlist` | `[ 11 ]` Early Access | Join waitlist | `--beige-bg` (explicit) |

**Background rhythm:** alternating beige tones create vertical rhythm. When adding a new section, look at what's directly above and below it and pick the *opposite* tone. Avoid two consecutive sections with the same bg unless one of them is `--beige-card` (which reads as a "lift" rather than a same-tone repeat).

### Section template (use as starting point for any new content section)

```html
<section class="section-divider" id="YOUR-SECTION-ID" aria-label="Your section purpose">
  <div class="section-inner">
    <div class="section-eyebrow fade-up">
      <span>[ NN ]</span>
      <span class="eyebrow-line"></span>
      <span>SECTION LABEL</span>
    </div>

    <h2 class="section-h2 fade-up d1">
      A short declarative sentence with one<br>
      <span class="italic" style="color:var(--plum);">italicized phrase.</span>
    </h2>

    <p class="font-body fade-up d2" style="margin-top:24px; max-width:680px;">
      A 1-3 sentence intro that says what the section will show. No marketing voice.
    </p>

    <!-- Section-specific content here -->
  </div>
</section>
```

Notes:
- Wrap content in `<div class="section-inner">` for the 1440px max-width + 56px vertical padding container.
- Use `<h2 class="section-h2">` exactly once per section. Italicize ONE phrase per H2 via `<span class="italic" style="color:var(--plum);">`.
- Add `fade-up d1 d2 d3` to elements for staggered scroll-in animation.
- Eyebrow numbers should continue from `[ 11 ]` if you're adding new sections to the existing page. On standalone pages, start fresh at `[ 01 ]`.

### `--beige-bg` section variant

For a beige-tinted section, add an inline style to the opening tag:

```html
<section class="section-divider" id="..." aria-label="..." style="background:var(--beige-bg);">
```

For a card-tone "lift" section (one shade darker, used once for Precision):
```html
<section class="section-divider" style="background:var(--beige-card);">
```

---

## 3. Component Library

### Buttons

#### `.btn-pill` — nav "Sign in"-style pill
```css
display:inline-flex; align-items:center; gap:6px;
border:1px solid rgba(0,0,0,0.12); border-radius:999px;
padding:7px 16px;
font-family:'Inter'; font-size:13px; font-weight:500;
background:transparent; color:var(--ink-black);
```

#### `.btn-solid` — primary CTA (Get Early Access)
```css
background-color:var(--ink-black); color:var(--beige-bg);
border-radius:12px; padding:14px 32px;
font-family:'Inter'; font-size:1.05rem; font-weight:600;
```

#### `.btn-outline` — secondary CTA
```css
background:transparent; border:1px solid rgba(0,0,0,0.15);
border-radius:12px; padding:14px 28px;
```

#### `.btn-solid-lg` — extra-large hero CTA (rarely used; only on hero)
Same as `.btn-solid` but bigger padding. Inspect existing markup before reusing.

**Button arrow micro-interaction.** The header "Get Early Access" CTA contains an inline `<span class="arrow">→</span>` that translates on hover. To reuse:
```html
<a href="..." class="btn-solid">
  Label
  <span style="display:inline-block;transition:transform 0.3s;" class="arrow">→</span>
</a>
```
CSS already in the stylesheet translates the arrow on `.btn-solid:hover .arrow`.

### Eyebrow (section number + line + label)

```html
<div class="section-eyebrow">
  <span>[ 09 ]</span>
  <span class="eyebrow-line"></span>
  <span>SECTION LABEL</span>
</div>
```

For centered (FAQ-style) variant, add `style="justify-content:center;"`:
```html
<div class="section-eyebrow fade-up" style="justify-content:center;">
  ...
</div>
```

### Cards

#### `.card-pill` — small uppercase mono tag (used inside cards as a category chip)
```css
display:inline-flex; padding:4px 10px;
border:1px solid rgba(0,0,0,0.12); border-radius:999px;
font-family:'Space Mono'; font-size:10px; color:var(--ink-mid);
```

#### `.card-code` — code block inside a card (used in How-to-Cite for BibTeX)
```css
background:rgba(0,0,0,0.04); border:1px solid var(--border-soft);
border-radius:6px; padding:14px 16px;
font-family:'Space Mono'; font-size:11px; line-height:1.9;
margin-top:20px; color:var(--ink-mid);
```

### Sticky-note callouts (Evidence Board style)

Use these sparingly for "interesting fact" sidebars. Each note has a tinted background + a pin element. The `.rn-*` (research note) class family handles it:

- `.rn-pin` — the pin dot in the upper-left of the note. Has variants: `.rn-pin--amber`, `.rn-pin--plum`, `.rn-pin--teal`.
- `.rn-tag` — uppercase mono category tag.
- `.rn-title` — Garamond title.
- `.rn-body` — Source Serif body.
- `.rn-meta` — small meta line (authors / year).
- `.rn-link` — sage uppercase mono link.
- `.rn-footer` — bottom row of a note.

To replicate, copy a `.rn-card` block from the Evidence Board section in the shipped file (around line 2074-2225) and edit the contents.

### Faq accordion (if reused on a new page)

```html
<div class="faq-list">
  <div class="faq-item">
    <button class="faq-q font-body" aria-expanded="false" id="faq-qN">
      Question text?
      <span class="faq-chevron font-mono">+</span>
    </button>
    <div class="faq-answer" role="region">
      <p>Answer paragraph.</p>
    </div>
  </div>
  <!-- repeat -->
</div>
```

The JS at the bottom of the shipped page automatically wires `.faq-q` clicks to toggle `aria-expanded` and animate `.faq-answer` height. If your new page reuses this markup AND inlines the same `<script>` block, it works without changes.

---

## 4. The Shared Chrome (Header + Footer)

Every additional page MUST include the same `<header>` and `<footer>` blocks for visual consistency. Copy them verbatim from the shipped file:

- Header markup: lines ~1731-1782 of `version_1_website_MetaSynthesis.html`.
- Footer markup: lines ~2852-2926 of `version_1_website_MetaSynthesis.html`.

When you reuse them on a sub-page (e.g. `/about/`, `/changelog/`), update internal hash anchors (`#features`, `#how-it-works`) to fully-qualified URLs back to the landing page (e.g. `/#features`) so they still navigate correctly.

### Logo mark

The current logo glyph is an `S` (legacy from SynthAI), with an inline `[[LOGO MARK INSTRUCTION]]` comment. Until you ship a real `M` or `MS` monogram, leave the `S` and the instruction comment in place on every page. Don't invent a different glyph per page.

---

## 5. Tokens to fill before going live

These are the bracketed placeholders embedded in the shipped page. Any new page should reuse the same token names (don't invent new ones) so the user can do one find-and-replace pass across the entire site.

| Token | Meaning |
|---|---|
| `[[DOMAIN]]` | Canonical site URL, e.g. `https://metasynthesis.ai` |
| `[[HOME_URL]]` | Logo / home link target (usually same as DOMAIN) |
| `[[SIGN_IN_URL]]` | Sign-in destination |
| `[[CONTACT_EMAIL]]` | Public contact email |
| `[[GITHUB_URL]]` | GitHub org or repo URL |
| `[[LINKEDIN_OR_PROFILE]]` | Founder's professional profile |
| `[[CALENDLY_OR_DEMO_URL]]` | Demo / "book a call" URL |
| `[[FOUNDER_FULL_NAME]]` | "Dhaduk, V." or full name as preferred |
| `[[FOUNDER_ORCID_URL]]` | Full ORCID URL |
| `[[FOUNDER_ORCID_ID]]` | The 16-digit ORCID iD |
| `[[MODEL_NAME]]` | Which LLM was used (for citation honesty) |
| `[[TESTIMONIAL_1_NAME]]`, `..._ROLE_AND_AFFILIATION`, `..._QUOTE` (and `_2`, `_3`) | Real beta-user quotes |
| `[[ADD DOI]]` | Six Evidence Board entries flagged as unverified |
| `[[INSTRUCTION: ...]]` and `[[OPTIONAL: ...]]` and `[[... INSTRUCTION]]` blocks | Inline editorial guidance; delete entirely before going live |

**Important:** these tokens are visibly broken on purpose so they can't slip past review. When you add new pages, use the same convention rather than inserting fake data.

---

## 6. Copy & content patterns

### How H2 is written

Always one short declarative sentence. The italicized portion is the emotional payoff or the noun-phrase being defined. Examples from the shipped page:

- Features: `Built for researchers who care about` *`precision and provenance.`*
- Evidence Board: `What the literature` *`actually says.`*
- About: `I built MetaSynthesis AI because` *`research deserves better tools.`*

When adding a new section, write an H2 that sounds like one of these. Avoid:
- Questions ("Why MetaSynthesis AI?")
- Two-clause sentences with conjunctions
- Anything that contains a number or a benefit claim

### How body paragraphs are written

- Source Serif 4, 15px, line-height 1.55.
- Max 4 sentences. Cut anything over 80 words.
- One claim per sentence. Hedged claims are fine ("targets," "in preparation," "we expect").
- If a paragraph makes a forward-looking statement, the next paragraph should bound the statement (what's not yet validated, what guidance it follows, what'll be published).

### How CTAs are worded

| Use | Example |
|---|---|
| Primary CTA | "Get Early Access" |
| Secondary CTA | "View the Evidence Board" / "Read the validation plan" |
| Tertiary link | "How to cite" / "See the protocol" |

Never: "Buy now," "Sign up free," "Try it today," "Start your trial."

---

## 7. Suggested additional pages (and how to build them)

If you're generating more pages of this site, here are the most likely candidates and a one-line build hint for each:

| Page | Purpose | Build hint |
|---|---|---|
| `/changelog/` | What shipped, when | Reverse-chronological list. Use `.rn-card` style sticky-note pattern for each entry. Eyebrow `[ 01 ] Changelog`. |
| `/docs/` | Product documentation index | Use `.section-eyebrow` per docs category. Each subsection = features-grid card linking to a sub-doc. Sage accent for active section. |
| `/validation-study/` | Protocol page for the TRIPOD-LLM validation study | Long-form prose page. Single column, max-width 720px, body 17px. Title + abstract + methods + outcomes sections, each with its own H2 and eyebrow. |
| `/blog/` | Blog index | Grid of cards, 320px min width, auto-fit. Each card: `.card-pill` for category, `<h3>` Garamond italic title, `.font-body` 2-line summary, `.rn-link` "Read →". |
| `/blog/<post-slug>/` | Individual blog post | Same structure as `/validation-study/` template — single column, max-width 720px. Footer should include "Cite this post" using the same How-to-Cite component. |
| `/about/` (long) | Extended founder + project story | Reuse the About section markup from L2629-L2748 of the landing page and expand each section into its own H2. Single column, max-width 760px. |
| `/legal/privacy/` and `/legal/terms/` | Boilerplate legal pages | Single column, plain. Header eyebrow `[ 01 ] Privacy` / `[ 01 ] Terms`. Use `<h3>` Garamond italics for sub-headings. |
| `/contact/` | Contact page | Reuse the 5-card contact grid from the About section (lines 2715-2740). Add a `<form>` underneath if you want a contact form. |
| `/pricing/` (expanded) | Long-form pricing | Reuse existing pricing cards. Add an FAQ section below using the existing `.faq-list` pattern. |

---

## 8. Hard rules (don't break these)

1. **Don't introduce new colors.** Reuse the 26 design tokens. If you genuinely need a new hue, add it to `:root` first and document it here.
2. **Don't use emojis in body copy.** The brand voice is restrained. The single decorative arrow (`→`) on CTAs is the only "icon" in body copy.
3. **Don't fabricate numbers.** Every quantitative claim must either cite a real published paper (with verified DOI) or be labeled as an aspirational target.
4. **Don't claim validation that doesn't exist.** The TRIPOD-LLM validation study is "in preparation" — phrase it that way every time.
5. **Don't add testimonials with invented names.** Use the bracketed placeholder pattern.
6. **Don't break the eyebrow numbering.** If you add a new section to the landing page, renumber sequentially. If you're building a new standalone page, start fresh at `[ 01 ]`.
7. **Match the section-bg rhythm.** Sections alternate `default` / `--beige-bg` / `--beige-card` to create vertical rhythm. Don't put three same-bg sections in a row.
8. **Don't link to `#` placeholders without a banner comment.** The landing page has a 13-line HTML comment above the footer explaining the dead links. Any new page that ships before all routes are real should include a similar comment.
9. **Don't reword the rebrand.** It's MetaSynthesis AI (full name) and Curie Project (umbrella org). Never abbreviate to "MSA" or "MS AI" or "Curie."
10. **Don't put the founder's photo anywhere.** This was explicitly removed during the rebuild. The brand is the work, not the face.

---

## 9. JS dependencies (already inlined in the shipped page)

The shipped page contains a 15KB inline `<script>` block at the bottom that wires up:

- `.faq-q` accordion toggles (aria-expanded + height animation)
- Mobile hamburger menu (`#hamburger` toggles `#mobile-menu`)
- IntersectionObserver-based `.fade-up` reveals (with optional `.d1` / `.d2` / `.d3` stagger)
- Evidence Board sticky-note placement (`initBoard`, `placeNote`, pointer drag handlers)
- Use Cases carousel (`initUseCasesCarousel`, `updateCarousel`, `animate`)

**If you build a new standalone page that only needs FAQ + fade-up + mobile menu, you can copy just those three handlers** and skip the Evidence Board / Use Cases JS to keep payload small. If you reuse those specific components, copy the entire script block.

No external JS dependencies (no React, no jQuery, nothing). Vanilla DOM API only.

---

## 10. File layout convention

Keep generated pages organized:

```
/mnt/results/website/
├── version_1_website_MetaSynthesis.html       (landing page — shipped)
├── docs/
│   └── DESIGN_SYSTEM.md                       (this file)
├── pages/
│   ├── changelog.html
│   ├── validation-study.html
│   ├── about.html
│   ├── pricing.html
│   └── ...
├── blog/
│   ├── index.html
│   └── <post-slug>/index.html
└── legal/
    ├── privacy.html
    └── terms.html
```

Each new page should:
1. Start with a `<!DOCTYPE html>` and the same `<head>` block (copy fonts, meta, theme-color).
2. Include the shared header + footer.
3. Use a fresh eyebrow sequence starting at `[ 01 ]`.
4. End with the appropriate subset of the inline `<script>` block.
5. Save to its destination path under `/mnt/results/website/`.

---

## 11. Quick-start prompt for an LLM building a new page

When asking an LLM to build a new page using this design system, paste the following at the top of the prompt:

> You are building a new page for the MetaSynthesis AI website (Curie Project). The design system is documented in `DESIGN_SYSTEM.md`. Hard rules: reuse the 26 CSS custom properties, do NOT introduce new colors, use the exact `<header>` and `<footer>` markup from the shipped landing page, follow the alternating section-background rhythm (`default` ↔ `--beige-bg`, with one `--beige-card` "lift" allowed), and use bracketed `[[TOKEN]]` placeholders for any user-fillable values rather than inventing data. Voice: plain, declarative, honest about beta status. Body in Source Serif 4 15px line-height 1.55. H2 in EB Garamond 400-weight with ONE italicized phrase in `<span class="italic" style="color:var(--plum);">`. Output a single self-contained `.html` file.

That single instruction, combined with the rest of this document, is enough to produce a page that visually and editorially matches the landing page.

---

*Document generated 2026-06-11 from a structural audit of `version_1_website_MetaSynthesis.html` (sha `25b8c3a7c4d4fe6fd51368726b645b03a0a3d05313d0d8f4d4b4af13555f894c`).*
