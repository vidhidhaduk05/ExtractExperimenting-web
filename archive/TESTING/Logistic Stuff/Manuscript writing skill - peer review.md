---
name: manuscript-writing
description: Revise or peer-review scientific, technical, and academic manuscripts, proposals, grants, abstracts, theses, or reports for precision, concision, logical cohesion, citation support, evidence alignment, and objective scholarly tone. Two modes — `revision` (edits a new copy of the text/document) and `review` (referee-style comments only, source never changed) — both driven by a strict 6-phase revision checklist with a hard no-fabrication rule (never invents citations, data, numbers, mechanisms, or novelty claims; unverifiable claims are flagged under "Needs Verification"). Use whenever someone asks to revise, edit, polish, tighten, proofread, copy-edit, critique, referee, or peer-review a paper/manuscript/draft/proposal, wants reviewer-style feedback before journal submission, asks "review this manuscript", "peer review this draft", "tighten my methods section", or uploads a .docx/.pdf/.doc/.md/.tex manuscript for editorial work — even if they don't name a checklist. Produces a standalone referee report (.docx + .pdf) and/or an inline-commented copy of the manuscript, or revised prose/documents, without touching the original file.
---

# Manuscript Writing

Faithful Phylo/Biomni port of the open-source `manuscript-writing` skill by YSLAB-ai
(https://github.com/YSLAB-ai/manuscript-writing, MIT). See `LICENSE-UPSTREAM.md`. The governing
checklist in `references/revision-checklist.md` is a verbatim copy of the upstream rubric.

## Scope

Improve academic and scientific writing **without changing unsupported claims**. This skill does
NOT fact-check the science for you, run analyses, generate missing data, or supply citations that
are not already in the manuscript or user-provided context. It edits or critiques *prose,
structure, evidence-alignment, and citation logic* against a fixed checklist.

## The one rule that overrides everything: no fabrication

Use **verified facts only**. Never invent or "improve" citations, data, numerical values,
mechanisms, temperature/parameter ranges, causal relationships, or novelty claims. If a claim
cannot be verified from the manuscript text, its own figures/tables, its cited references, or
user-supplied context, **flag it under `Needs Verification`** — do not rewrite it into fact and do
not assert it is wrong without checking. When a checklist item needs materials that are
unavailable (a figure, an equation, a citation), flag that item rather than skipping it silently.

## Modes

Pick the mode from the user's verb. When unsure, default to `review` (it is non-destructive).

- **`revision`** — user asks to *edit, revise, rewrite, polish, tighten, proofread, or improve* the
  text. For pasted text, return revised prose. For a document file, create a **new revised copy**
  and leave the original unchanged.
- **`review`** — user asks for *comments, feedback, critique, an audit, a referee report, or a peer
  review* without changing the manuscript. For pasted text, return a grouped list of actionable
  suggestions. For a document file, create a **new commented copy** (and, for Biomni, a standalone
  referee report — see Document Deliverables).

If the user asks for **both**, run `review` first, then ask before applying edits unless direct
revision was already clearly requested.

## Governing checklist (read it first, every time)

Before doing anything, read `references/revision-checklist.md` and execute its phases **in order**:

0. **Scope setup** — audience, journal/venue, word limit, tone. Preserve technical meaning; flag
   (don't silently make) any change to scope, certainty, mechanism, or causality.
1. **Precision & clarity** — specify vague language; resolve ambiguous adjectives; quantify
   "significantly"-type adverbs only with values the text supplies; standardize terminology (no
   elegant variation); delete tautologies ("new innovation" -> "innovation"); explain niche jargon;
   remove orphan abbreviations (appearing once).
2. **Concision & flow** — nominalizations -> strong verbs; combine into Property/Action ->
   Consequence; delete orphan facts; remove argument echoing; keep transitions only for real
   logical links.
3. **Tone & formatting** — strip hyperbole ("first-ever", "unprecedented", "perfect"); calibrate
   certainty ("proves" -> "demonstrates/indicates/suggests"); prefer objective active voice with
   data/model/literature as subject; bullets -> prose where the venue expects prose; break
   dash-bridged run-ons.
4. **Scientific rigor & structure** — validate the problem statement (no strawman gaps); verify
   citation coverage for every factual/benchmark/novelty claim and check cited work is recent;
   classify each claim as evidence / interpretation / limitation / implication; state limitations
   and boundary conditions; confirm citation *specificity* (the cite supports the exact claim, not
   just the topic); cross-examine data consistency (every number/percentage/CI in text vs the
   figures/tables, and denominator logic); audit figure/table sequencing (sequential numbering +
   every float called out); define equation variables; forbid correlation->causation and
   single-result->general-law leaps; audit multi-level flow.
5. **Final audit** — produce a revision log; re-read once for accuracy and once for prose.

### Tone-rule note (voice)
The checklist's Phase 3 marks BOTH agentless passive ("It was demonstrated that") AND first-person
("We demonstrated that") as non-preferred, favoring an objective subject ("Empirical testing
demonstrates that"). Many journals (e.g., *Vaccine*, most Elsevier/《Nature》 titles) explicitly
permit first-person "we". When the target venue permits "we", do not mechanically strip it —
instead note the voice choice as a stylistic option rather than presenting it as a hard error.
Respect the checklist, but calibrate to the confirmed venue in Phase 0.

## Document file handling (never overwrite the original)

For `.doc`, `.docx`, `.pdf`, `.md`, or `.tex` inputs, always write a **new** output file with a
clear suffix (`-reviewed`, `-commented`, `-revised`, `-PeerReview`). Never modify the user's
original.

- **review mode:** do not edit the manuscript body. Anchor each finding as an inline comment (or
  annotation) at the relevant location; each comment carries the checklist issue + suggested
  action + any verification/citation need.
- **revision mode:** apply supported edits directly in the new copy's body; reserve comments for
  unresolved verification needs, rationale the author must review, or questions. Do not put an
  already-applied edit into a comment.
- If a format cannot safely carry comments/layout, produce the closest faithful artifact and state
  the limitation. Do not touch the original.

## For each issue (both modes), provide

- **Location** — section / paragraph / sentence / heading / figure / table / equation.
- **Issue** — the specific problem (unsupported claim, vague term, overstatement, missing citation,
  inconsistent terminology, flawed comparison, unclear causal logic, etc.).
- **Why it matters** — the precision, rigor, readability, or evidence problem it creates.
- **Suggested action** — a concrete edit, verification step, citation need, or structural move.
- **Optional rewrite** — one concise sentence, clearly marked as *suggested wording* (illustrative,
  not required text).

**Prioritize high-impact issues first:** unsupported novelty, incorrect certainty, data
inconsistency, mathematical errors, missing citations for factual claims, and claims exceeding the
evidence. Then flow, concision, tone, and style.

## Output grouping

Group all `review` output (and the revision log's rationale) under these labels:
`Scientific Rigor`, `Evidence and Citations`, `Structure and Flow`, `Style and Clarity`.
Keep unverifiable items under a separate `Needs Verification` list. Do not present stylistic
preferences as factual requirements.

## Document Deliverables (Biomni)

When the input is a document and the user wants files (not just chat feedback), produce real
artifacts with `scripts/build_review_report.py` as a starting point:

1. **Referee report** — `<name>_PeerReview.docx` **and** `.pdf`: header (title, venue, date,
   reviewer = "AI referee via manuscript-writing skill + revision checklist", mode); a summary
   assessment; a data-consistency statement; the grouped, severity-tagged
   (CRITICAL/MAJOR/MINOR), high-impact-first findings; a `Needs Verification` section; and a
   recommendation (Accept / Minor / Major revision) with the top must-fix items.
2. **Inline-commented copy** — `<name>_commented.docx`: a byte-copy of the original with each
   finding anchored as a native Word comment (python-docx 1.2.0 `Document.add_comment(runs=[...],
   text=...)`), body text unchanged.
3. Optionally a machine-readable `..._findings.json` backing both.

### Biomni filesystem + rendering rules (important)
- python-docx **cannot** save directly to `/mnt/results/` (S3/FUSE seek limitation). Save to
  `/workspace/` first, then shell `cp` to `/mnt/results/`. Same for `.xlsx/.pptx/.h5`. R's
  `file.copy()` also yields 0-byte files on `/mnt/results/` — use shell `cp`.
- Render PDF with LibreOffice: verify `which soffice` first (apt installs don't survive
  hibernation), then `soffice --headless --convert-to pdf --outdir /workspace/... <file>.docx`.
- **Verify integrity, always:** confirm the commented copy's paragraph texts are identical to the
  original (zero body diffs), confirm the original's size/hash is unchanged, and run a visual
  media-check (`Read` with `mode=media_output_check`) on the report PDF before delivering.
- Match string edits to the document's exact characters (straight vs curly quotes, em-dashes, ≥).
  Assert each exact-string target matches once before replacing; compare revised token counts to
  the original as a fact-drift guard.

## Verification depth

Default to **internal** review (against the manuscript's own text/figures/tables/citations) with
`Needs Verification` flags. Optionally spot-check a few *pivotal* external claims/citations
(headline statistics, novelty claims, a key reference's specificity) against the literature — but
only assert an error after confirming it from the source, and never fabricate a correction.

## Reusable helper

`scripts/build_review_report.py` — reads a findings JSON (list of {id, group, severity, location,
checklist, issue, why, action, optional rewrite}) plus a source `.docx`, and emits the referee
report `.docx` and the inline-commented `.docx`. Run `python scripts/build_review_report.py
--help` for arguments. It is a scaffold: the findings themselves must come from a genuine,
grounded checklist pass — the script only formats them.
