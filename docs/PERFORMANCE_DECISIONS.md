# Performance decisions

## 2026-10-26 — Bound ClaimScape's in-memory result cache

Retain at most 128 result entries per process using least-recently-used eviction.
Serialize cache reads, recency updates and insertions with a lock. Copy response
metadata on insertion and retrieval so the `cached` flag does not mutate the
stored result. Apply the same policy to disk reloads, live scan results and local
evaluation results. Evicted results remain available through the existing disk
cache. This bounds entry count, not bytes or disk usage.

Scientific decisions, screening thresholds, inference providers and response
schemas are unchanged. Cache expiry, database write batching, screening batching
and PDF admission limits remain separate work; this commit does not implement
or claim speed improvements for those paths.

Planning: compact; dependency inspection; targeted integration verification;
local execution because the Jules API key is unavailable.
