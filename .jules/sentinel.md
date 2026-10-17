# Sentinel's Journal - Security Learnings

## 2026-10-10 - Project Authorization Enforcement on Graph Endpoints
**Vulnerability:** Missing `check_project_access(conn, project_id, user)` check in `GET /api/projects/{project_id}/graphify/review/graph`.
**Learning:** When adding new analytical or visualization endpoints (such as graphify review data endpoints), endpoint parameters like `project_id` must explicitly enforce project membership authorization via `check_project_access`. Omission allows authenticated non-members to exfiltrate project study details.
**Prevention:** Ensure all FastAPI routes receiving `project_id` call `check_project_access(conn, project_id, user)` prior to database query execution and data retrieval.
