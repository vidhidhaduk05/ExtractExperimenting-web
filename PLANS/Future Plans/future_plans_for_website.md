# Future Plans for Website

Created: 2026-10-26  
Status: Future planning backlog. No audit or implementation performed by recording this checklist.

## Purpose

Collect website launch requirements and user-supplied observations over time. This document does not authorize implementation, production testing, commits, or deployment. A launch checklist does not replace full QA or a professional audit.

Related plan: [Future Plans for Security](future_plans_for_security.md).

## Contribution 1 — User-supplied 20-item pre-launch website checklist

Received: 2026-10-26  
Source: Checklist supplied by the user, attributed to Michael's video; source not independently verified.  
Status of all items: **Not assessed**.

Legal/compliance statements below are user-supplied requirements to investigate, not verified legal conclusions. Applicability depends on actual data collection, tracking, users, and jurisdiction. Verify relevant requirements during the future assessment.

| ID | User-supplied item | Future assessment scope |
| --- | --- | --- |
| WEB-001 | Privacy policy page | Inventory data collection and processing; determine applicable privacy disclosures and provide an accurate policy page. User highlighted GDPR/CCPA applicability. |
| WEB-002 | Terms & conditions page | Define appropriate service-use terms and ensure the page is accessible and accurately reflects the product. |
| WEB-003 | Get secrets off the frontend | Check client source, bundles, source maps, and configuration for secrets. Distinguish intentionally public configuration from credentials. Coordinate with the security plan. |
| WEB-004 | Force HTTPS | Assess HTTP-to-HTTPS redirects for actual frontend/API hosting. Coordinate with SEC-001; redirects and HSTS are related but distinct. |
| WEB-005 | Cookie consent banner | Inventory cookies and tracking, assess consent requirements, and verify applicable consent behavior rather than adding a banner without functional controls. |
| WEB-006 | Meta titles and descriptions | Review meaningful page-specific titles and descriptions, including discoverability of public routes. |
| WEB-007 | Social preview image | Add and verify appropriate Open Graph metadata and an accessible share-preview image. |
| WEB-008 | Favicon | Provide appropriate browser-tab and supported device icons. |
| WEB-009 | Sitemap and robots.txt | Assess public-page indexing and provide appropriate sitemap and robots.txt files. These files must not be treated as access controls for private project data. |
| WEB-010 | Alt text on images | Review meaningful text alternatives for informative images and appropriate treatment of decorative images. |
| WEB-011 | Compress images | Optimize formats, dimensions, and delivery while preserving required visual quality. |
| WEB-012 | Check page load speed | Measure with Lighthouse or PageSpeed Insights and representative real-browser checks; record the tested page, conditions, and actual results. |
| WEB-013 | Fix color contrast | Assess text and interactive-state contrast against the selected accessibility standard and approved theme. |
| WEB-014 | Make it mobile friendly | Test responsive layouts, touch interactions, readable content, forms, and navigation on representative phone screens and the narrow app side panel. |
| WEB-015 | Custom 404 page | Provide useful branded not-found behavior and verify compatibility with GitHub Pages and application routing. |
| WEB-016 | Fix broken links | Check public links, navigation, downloads, and internal routes; distinguish actual missing pages from application-routing failures. |
| WEB-017 | Form validation | Review client-side feedback and authoritative server-side validation. Coordinate security-relevant findings with SEC-013. |
| WEB-018 | Spam protection | Assess contact-form abuse controls, such as rate limiting, honeypots, or an appropriate challenge service. The user's example was reCAPTCHA or similar; do not assume a provider is required. |
| WEB-019 | Set up analytics | Decide whether analytics are needed, select an appropriate option such as Google Analytics or Plausible, and assess consent, data minimization, and private-route tracking before enabling it. No vendor selected yet. |
| WEB-020 | One clear call to action | Give each public page a clear primary next action with working destinations and coherent labels. |

## Contribution 2 — UX, conversion, and local SEO checklist

Received: 2026-10-26  
Source: User-supplied checklist attributed to Alex's video; video not independently verified.  
Status: Future requirements to assess, not authorization to implement. No new item has been verified.

Apply the relevant items to the research software and public website. Local-business features are conditional rather than assumed requirements. Do not fabricate reviews, case-study results, team identities, addresses, or service commitments.

### Existing items expanded by this contribution

| Checklist item | Existing ID | Added requirement or clarification |
| --- | --- | --- |
| 1. Custom 404 page | WEB-015 | Keep branded recovery and useful navigation in the existing requirement. |
| 2. Clear CTA above the fold | WEB-020 | Make the primary public-page action visible in the initial viewport where practical, including phone layouts, without crowding the page. |
| 3. Internal links | WEB-016 | Add meaningful links between relevant public pages and workflow steps; validate destinations and avoid exposing private project content. |
| 9. Sticky mobile CTA | WEB-014, WEB-020 | Assess a persistent primary action on mobile where useful; it must not obscure content, keyboard focus, form controls, or document tools. |
| 10. robots.txt | WEB-009 | Retain the existing crawl/index assessment; robots.txt is not protection for private data. |
| 11. Unique page titles | WEB-006 | Ensure distinct, descriptive titles for relevant public pages and useful titles for application screens. |
| 12. Meta descriptions | WEB-006 | Write accurate page-specific descriptions. The user's 150–160 character suggestion is an editorial target to assess, not a guaranteed search-display length. |
| 13. Social share image | WEB-007 | Reuse the Open Graph/share-preview requirement. |
| 16. Image alt text | WEB-010 | Reuse the text-alternative requirement, including decorative-image handling. |
| 18. Privacy policy | WEB-001 | Reuse the data-practice and applicability assessment; do not claim legal compliance from the presence of a page alone. |
| 19. Google Analytics | WEB-019 | Capture traffic/conversion goals if analytics are selected. Google Analytics is an option, not an approved mandatory provider; preserve privacy and consent assessment. |

### Additional backlog items

| ID | User-supplied item | Future assessment scope |
| --- | --- | --- |
| WEB-021 | Thank-you page | After a genuinely successful form submission, provide a clear confirmation page or equivalent success state and useful next action. Never imply delivery when submission failed; avoid sensitive data in URLs or public pages. |
| WEB-022 | Breadcrumbs | Add meaningful location trails on nested public pages or project workflows where helpful. Preserve project context and provide accessible navigation. |
| WEB-023 | Case studies | Publish real, permissioned examples with verifiable methods, outcomes, and limitations. Distinguish illustrative demos from real customer results; protect research and participant confidentiality. |
| WEB-024 | Five FAQs | Identify and answer the five most useful product/service questions as an initial content target. Keep answers accurate, task-focused, and consistent with actual functionality. |
| WEB-025 | Response-time expectations | State a realistic, operationally supported reply window for inquiries. Confirm the owner's commitment before publishing a promise such as “within 24 hours”; remove placeholder response times. |
| WEB-026 | Maps and directions — conditional | Assess only if a real public business location and visitor directions are relevant. Confirm the approved address and map provider; omit for an online-only research product where unnecessary. |
| WEB-027 | Authentic customer reviews | Use genuine testimonials with permission and accurate attribution. Obtain approval for names and photos; never generate fake endorsements or present placeholders as reviews. |
| WEB-028 | Local business schema — conditional | Assess only if the organization qualifies and verified business details are available. Select structured data appropriate to the actual product/business; do not invent location information or promise enhanced search results. |
| WEB-029 | Real team photography | Use owner-approved authentic team photos where relevant, with publication permission and accessibility treatment. Do not substitute invented people or present generated/stock images as the actual team. |

### Prioritization for later assessment

Start with working navigation, clear primary actions, genuine form confirmation, mobile usability, and truthful content. Assess public-page metadata and indexing alongside those tasks. Add trust content only when verified material and permissions exist. Defer local-business features until applicability is established. This is a proposed audit order, not a scheduled implementation.

## Future assessment process

1. Inspect the actual site, code, deployment, and data practices.
2. Record each item as Not assessed, Applicable, Not applicable with rationale, Planned, In progress, Verified, or Deferred with rationale.
3. Separate observed defects from proposals and user-supplied claims.
4. Define affected pages, priority, owner, acceptance criteria, and implementation scope before work starts.
5. Record reproducible evidence and actual verification results; do not mark an item complete based only on appearance or intended changes.
6. Reference overlapping security items without losing either checklist's acceptance criteria.

## Contribution 3 — Legal templates reference for the privacy policy

Added: 2026-10-26  
Related item: WEB-001 (Privacy policy page).  
Status: Reference saved for future drafting; no policy drafted or published.

- Repository: [General-Legal/legal-templates](https://github.com/General-Legal/legal-templates).
- Privacy policy starting points: [U.S. only](https://github.com/General-Legal/legal-templates/tree/main/templates/privacy-policy-us) and [GDPR enhanced](https://github.com/General-Legal/legal-templates/tree/main/templates/privacy-policy-gdpr).
- Related reference: [Cookie notice](https://github.com/General-Legal/legal-templates/tree/main/templates/cookie-notice).
- Source checked on 2026-10-26: the repository describes attorney-drafted templates released under [CC0 1.0](https://github.com/General-Legal/legal-templates/blob/main/LICENSE), with customizable fields marked using `<mark>` tags.

When WEB-001 is assessed, select and adapt the relevant template to the product's verified data collection, processing providers, retention, cookies, user rights, and contact details. Resolve all placeholder fields and assess jurisdictional applicability before publication. Saving this reference does not establish legal compliance or approve a particular template.

## Contribution 4 — Usability and navigation improvements

Received: 2026-10-26  
Source: User-supplied list, titled “20 UX features Claude can add to your website.”  
Status: Saved for future assessment; none assessed or implemented by recording this list.

Goal: Make the website easier to navigate, read, and use, while reducing lost work. The source's “in an afternoon” framing is not a verified effort estimate or delivery commitment. Assess existing functionality before adding features.

| Source item | Tracking ID | Feature | Future assessment scope |
| --- | --- | --- | --- |
| 1 | WEB-030 | Dark mode toggle | Assess a light/dark preference with persistence and system-preference support; derive any dark palette from the Master Theme and verify contrast. |
| 2 | WEB-031 | Language switcher | Assess supported languages, translation coverage, locale persistence, and untranslated-content fallback. |
| 3 | WEB-032 | Back to top button | Add where long pages benefit; provide an accessible label, useful focus behavior, and reduced-motion support. |
| 4 | WEB-033 | Reading progress bar | Assess for long reading pages; calculate progress against the relevant reading area without obscuring content. |
| 5 | WEB-034 | Copy to clipboard button | Support useful text or code copying with clear success/failure feedback and accessible controls. |
| 6 | WEB-035 | Save for later | Assess bookmarks for relevant content, persistence, removal, and project/user access boundaries. |
| 7 | WEB-036 | Recently viewed pages | Assess useful history with clear/reset controls and access checks; avoid retaining sensitive page details unnecessarily. |
| 8 | WEB-037 | Keyboard shortcuts | Assess discoverable shortcut help, such as `?`, and `Esc` dismissal; avoid intercepting typing or conflicting with assistive technology and browser shortcuts. |
| 9 | WEB-038 | Adjustable text size | Assess reading-size controls while preserving browser zoom, reflow, and readable layouts. |
| 10 | WEB-039 | Interactive comparison tables | Assess sortable/filterable comparisons where useful; preserve table semantics and usability on mobile and with a keyboard. |
| 11 | WEB-024 | Searchable FAQs | Extend the existing FAQ requirement with search, clear/reset behavior, and a helpful no-results state. |
| 12 | WEB-040 | Auto-save form progress | Assess draft recovery across refresh/navigation, save-state feedback, expiry, and conflict handling; exclude passwords and secrets from draft storage. |
| 13 | WEB-041 | Password visibility toggle | Assess applicable login forms; provide an accessible show/hide control that preserves the entered value and focus. |
| 14 | WEB-042 | Share page buttons | Assess public-page sharing to X/Twitter, LinkedIn, WhatsApp, or native sharing; share canonical public URLs without private project data or tokens. |
| 15 | WEB-043 | Estimated reading time | Assess article/guide reading-time estimates based on actual content and label them as estimates. |
| 16 | WEB-044 | Filter and sort options | Assess useful controls for lists/content, clear active filters, reset/no-results states, and persistence appropriate to the page. |
| 17 | WEB-045 | Table of contents | Assess generated headings and stable anchor links for long pages, with accessible navigation and correct scroll offsets. |
| 18 | WEB-046 | Smart search bar | Assess autocomplete and relevant suggestions with keyboard support, loading/error/no-results states, and access-aware results. |
| 19 | WEB-021 | Form success notifications | Extend the existing thank-you/confirmation requirement with accessible confirmation only after actual successful submission; preserve failure and retry feedback. |
| 20 | WEB-047 | Offline access | Assess a service worker/PWA for selected pages, explicit offline states, cache updates, and recovery; define private-data caching and sign-out cleanup before enabling it. |

### Future implementation constraints and acceptance

- Preserve the Master Theme, approved typography, and universal user-facing terminology across controls, notifications, dialogs, and all new states.
- Assess applicability and existing coverage first; these ideas are not automatically requirements for every page.
- For any selected feature, define affected pages, persistence/privacy behavior, acceptance criteria, and tests before implementation. Verify keyboard use, accessible feedback, and layouts at 1440px, 903px, and 390px as applicable.
- Record observed results before marking anything Verified. This contribution authorizes saving the ideas only; implementation and deployment remain future work.

## Future contributions

Append new website requirements with date, source, affected feature, and redacted evidence. Do not store credentials or personal information in this backlog.
