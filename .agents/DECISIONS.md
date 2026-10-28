/home/vd00026/Desktop/Software/docs/DECISIONS.md
## 2026-10-28 — Scoped deduplication reliability merge into web main

- Integrated the deduplication reliability branch without importing unrelated source-repository history into the web tree. Preserved the web frontend, threshold sliders and existing API threshold parameters.
- Added the tiered candidate finder, durable candidate/rejection/audit/merge-plan/run tables and review/bulk-merge routes. The new routes use the existing strict project-access helper; legacy authentication behavior remains unchanged.
- Bulk execution honors the previewed master, rejects stale source snapshots, commits each group and its progress atomically, rolls back failures and supports durable retry/pause/resume. Rescans exclude already-merged records.
- Retained the web title-similarity metric and generic-title blocking cap; related reports remain individual-review proposals. Connected active duplicate counts to PRISMA tiers and added the duplicate-family pooling guard.
- Verification: 80 deduplication regression/API tests and 5 existing performance/threshold tests passed. The synthetic 1,885-record scan completed in approximately 2 seconds. Frontend production build passed.
- These checks establish scoped software behavior, not production-library matching accuracy or full application certification. The dedup API tests isolate their routes from unrelated optional model imports and use temporary storage.
