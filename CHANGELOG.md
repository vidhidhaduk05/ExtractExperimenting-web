# Changelog

All notable changes to the RadExtract platform are documented here.

## [Unreleased] - 2026-10-27

### Removed
- Removed duplicate root `src/` tree (`git rm -r src`) to enforce single source of truth in `radextract_platform/frontend`.
- Removed unrouted `PicoPage.tsx` and `HypothesisPage.tsx` (superseded by `PicoHypothesisPage.tsx`).
- Removed unrouted `BlindReviewPage.tsx` (superseded by single-reviewer screening workflow).

### Added
- Universal navigation with dedicated "All Projects" catalog back-button, project breadcrumbs, and quick project switcher dropdown.
- Top bar clarification notification bell with real-time pending count badge and drawer trigger.
