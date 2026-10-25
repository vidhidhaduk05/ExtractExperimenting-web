# Motion prototype, 25 October 2026

## Revision 2: preserve the landing page

The first preview omitted too much of the original page. This revision restores its recognizable structure: original hero and question form, Approach, ClaimScape, four-stage Process, radiology use cases, Collaboration, footer. The approved motion stays inside ClaimScape. Only files beneath prototypes/ are authored in this revision; no application source files are changed.

Active skills: UI/UX Pro Max (contrast, keyboard, reduced motion and readable control sizes), Taste (editorial composition, varied section rhythm, inspect/look/fix), awwwards (choreography, continuity and independent visual critique), GRAVITAS (scope and evidence).

Taste draw: editorial-report, palette/type kept; generated sheet under .taste-skill/. Keep the current hero instead of the dealt masthead/42% axis because the user explicitly requested preservation. Preserve the existing italic plum headline, three brand typefaces, eyebrow and form outline despite conflicting house preferences. The numbered process is a genuine ordered sequence. Keep semantic interface lines inside data-ui product fragments. Do not add unrelated photos or generic decorative imagery to satisfy a picture count.

Concept candidates: Reading room (professional material; O4/F5/Fe5/P2), Stellar atlas (name; O3/F3/Fe4/P4), Journal editorial (formal system; O3/F5/Fe5/P3). Selected Reading room: a clinical question remains the thread connecting methods, studies and interpretation. Editorial report composition is subordinate to the existing brand and requested page structure.

UI/UX design-system search returned a portfolio grid and unrelated typography. Rejected that layout and palette as outside the brief; narrowed the query to accessibility/motion guidance. No new palette or typefaces adopted.

Form filters and examples operate locally in the prototype. Research search execution remains outside this preview. External application links lead back to existing frontend routes. All evidence graphics remain illustrative.

Scope: standalone frontend prototype only. No application routes, backend calls, homepage edits, or dependency changes. Existing unrelated working-tree changes are out of scope.

Audience: academic radiologists first; broader clinical researchers second. Primary job: explore evidence for a research question.

Preserve: Stellar Labs wordmark, Bodoni Moda semibold display, Newsreader reading text, Work Sans controls, ivory #fbf9f4, plum #3a0f34 and #66365c, current hero wording.

Concept: evidence comes into focus. A question resolves into study cards and then a schematic evidence map as the reader scrolls. Scientific material, not decorative animation, carries the movement. Inspired by Phylo's scrolling product narrative, without reproducing its assets.

Motion: native scroll, requestAnimationFrame updates only after scroll/resize, IntersectionObserver reveals, gentle hero translation, interruptible opacity/transform transitions. No loaders or scroll interception. CSS/JavaScript standalone page, served by the existing Vite server; no framework migration or animation dependencies for this disposable review surface.

States: desktop sticky stage; compact mobile stage; explicit motion toggle; system reduced-motion preference disables pinning and displays all stages. Without JavaScript all material remains readable.

Data: example questions and schematic study/map placeholders only, explicitly labeled; no invented citations, diagnostic performance, study counts, or efficacy claims. Form previews local example text, never submits a real search.

Verification: browser screenshots, desktop/mobile overflow, keyboard controls, stage progression, reduced motion, console errors. User approval gates any integration into the live homepage.
