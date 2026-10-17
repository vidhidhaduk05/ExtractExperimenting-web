## 2026-03-30 - Unreachable Access Check in Download Report and Missing Checks on Analysis Endpoints
**Vulnerability:** In `download_full_report` (`GET /api/projects/{project_id}/analysis/report/download`), `check_project_access` was placed after the `return Response(...)` statement (making it dead code that was never executed). Other endpoints in `routers/analysis.py` also lacked `check_project_access` calls.
**Learning:** Placing authorization logic after early returns or at the bottom of handler functions bypasses security completely. Every route definition taking `project_id` must call `check_project_access(conn, project_id, user)` at the top of the function body.
**Prevention:** Verify that authorization checks are called as the first statement in endpoint handlers before any processing or return statements.

## 2026-03-30 - Inconsistent Project Access Checks on Graphify Endpoints
**Vulnerability:** Missing `check_project_access` call in `GET /api/projects/{project_id}/graphify/review/graph` allowed unauthorized access to sensitive review graph data across projects.
**Learning:** When adding multiple endpoints for a feature (e.g. graph data and graph stats), access control checks must be explicitly added to every endpoint handler taking `project_id`. `get_review_graph_stats` had the check, but `get_review_graph` lacked it.
**Prevention:** Ensure all `/projects/{project_id}/...` endpoints explicitly invoke `check_project_access` at the start of the function body.
