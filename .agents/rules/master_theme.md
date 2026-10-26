---
trigger: always_on
description: Mandatory Master Theme design standards, color tokens, typography rules, and UI component guidelines across the entire application.
---

# Master Theme & UI Aesthetics Rule

## Mandatory Policy for All Agents (Antigravity, Claude, Cline, Jules)
All existing screens, newly authored components, notification banners, dialogs, checklists, cards, tables, and buttons across `radextract_platform/frontend` and web repositories **MUST strictly conform to the Master Theme** defined in [`docs/MASTER_THEME.md`](file:///d:/Desktop/Rad%20Extract%20Experimenting/docs/MASTER_THEME.md). 

**Never use generic bright Tailwind colors (e.g. `bg-blue-600`, `text-red-500`), flashy neon gradients, or bloated SaaS bubbly UI. Maintain the refined academic editorial aesthetic at all times.**

---

## 1. Core Brand Voice & Design Language
- **Brand Identity**: Stellar Labs / RadExtract — Refined Academic Editorial.
- **Voice**: Warm, precise, curious, scholarly, and credible.
- **Audience**: Professors, radiologists, clinical systematic reviewers, and medical researchers.
- **Visual Feel**: Paper fields, warm wine inks, crisp fine outlines (`#d2c2cb`), and restrained, purposeful micro-interactions.

---

## 2. Canonical Color Palette (Tokens)

| Token Name | Hex Code | Mandatory Usage |
| :--- | :--- | :--- |
| **Primary Wine** | **`#3a0f34`** | Exact top-bar header background, primary action buttons, active indicator borders, brand wordmark, footers |
| **Deepest Plum** | `#1a0017` | Hover states on primary wine buttons/links; dark accent |
| **Paper Canvas** | **`#fbf9f4`** | Main application canvas background, cream closing bands, secondary paper field surfaces |
| **Surface White** | **`#ffffff`** | Cards, modal sheets, question blocks, checklists, table rows |
| **Editorial Plum** | **`#814d75`** | Secondary accents, active tab underlines, focus rings (`outline: 2px solid #814d75`), link hovers |
| **Muted Plum** | `#66365c` | Secondary editorial copy, pill badges, subtle active indicators |
| **Primary Reading Ink** | **`#4f444b`** | Primary readable body text, high-contrast labels, question text |
| **Secondary Ink** | **`#62535d`** | Descriptions, helper instructions, table headers, reviewer commentary |
| **Quiet Ink** | `#72636d` / `#81737b` | Metadata, timestamps, footnote text, secondary count badges |
| **Border Outline** | **`#d2c2cb`** | Thin 1px card outlines, divider rules, input borders, checklist borders |
| **Soft Plum Field** | `#eee7ec` | Secondary background sections, reading room background, subtle card hover |
| **Pale Amber** | `#ffdea6` | Active topic chips, highlighted search tags, warning/pending chip accents |
| **Ochre Accent** | `#7c5800` | Sparse editorial accent for verified badges or notes |

---

## 3. Typography Hierarchy

```css
:root {
  --font-heading: 'Serifon Editorial', 'Bodoni Moda', Georgia, serif;
  --font-body: 'QuadraatSmallCaps', 'Newsreader', Georgia, serif;
  --font-ui: 'Work Sans', system-ui, -apple-system, sans-serif;
  --font-mono: ui-monospace, 'SFMono-Regular', Menlo, Monaco, Consolas, monospace;
}
```

- **Headings & Display Titles**: Always use `Serifon Editorial` (`TheSerifonEditorialRegular-G3dBy.otf`, `TheSerifonEditorialItalic-j9gYj.otf`). Preserve natural italic accents for secondary emphasis.
- **Body Text & Reading Copy**: Use `QuadraatSmallCaps` for reading paragraphs, study summaries, and longform content.
- **UI Controls, Labels, Inputs & Metadata**: Use `Work Sans` (or system UI sans-serif) for buttons, form labels, filters, table data cells, badge text, and status tags to ensure high scannability and legibility.
- **Code, Queries, PMIDs & Hashes**: Use monospace with fine borders (`border: 1px solid #d2c2cb; background: #fbf9f4;`).

---

## 4. Component Construction Standards for New UI Elements

When authoring any new component (such as notifications, checklists, cards, modals, or forms):
1. **Surfaces & Cards**:
   - Background: `#ffffff` or `#fbf9f4`.
   - Border: Crisp 1px solid `#d2c2cb`.
   - Corner Radius: Subtle and refined (`rounded-xl` or `rounded-lg`, never hyper-rounded or bubbly pill cards).
2. **Buttons**:
   - **Primary Action**: `background: #3a0f34; color: #fbf9f4; border: none; font-family: 'Work Sans'; font-weight: 600;`. On hover: `background: #1a0017;`.
   - **Secondary Action**: `background: #ffffff; color: #3a0f34; border: 1px solid #d2c2cb;`. On hover: `background: #eee7ec;`.
   - **Tertiary / Ghost**: `background: transparent; color: #814d75; text-decoration: underline;`.
3. **Interactive Focus**:
   - Always provide accessible focus rings: `outline: 2px solid #814d75; outline-offset: 2px;`.
4. **Desktop Notifications & Toast Alerts**:
   - Style as compact OS-style banners (~350px wide) with `#ffffff` or `rgba(255, 255, 255, 0.98)` background, `#d2c2cb` border, `#3a0f34` header text, and `#62535d` body copy.
   - Do NOT construct massive, screen-blocking overlay cards.
5. **Checklists & Question Panels**:
   - Format questions clearly with distinct, selectable option cards using `#fbf9f4` unselected and `#3a0f34` (with `#fbf9f4` text) or `#ffdea6` when selected.
   - Pending state: Amber badge (`bg-amber-50 text-amber-900 border-amber-200`).
   - Resolved state: Muted Plum / Emerald badge (`bg-emerald-50 text-emerald-900 border-emerald-200`).

---

## 5. Verification Checklist for UI Changes
Before concluding any UI work:
1. Did you use the official colors (`#3a0f34`, `#fbf9f4`, `#d2c2cb`, `#814d75`) instead of arbitrary colors?
2. Are font families properly assigned (`Serifon Editorial` for headings, `QuadraatSmallCaps` for body copy, `Work Sans` for UI)?
3. Does the layout render cleanly across screen widths (1440px desktop, 903px tablet, 390px mobile) without horizontal clipping or overflow?
4. Are both local and web repositories kept synchronized?
