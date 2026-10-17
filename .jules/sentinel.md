## 2026-03-30 - Inconsistent Project Access Checks on Graphify Endpoints
**Vulnerability:** Missing `check_project_access` call in `GET /api/projects/{project_id}/graphify/review/graph` allowed unauthorized access to sensitive review graph data across projects.
**Learning:** When adding multiple endpoints for a feature (e.g. graph data and graph stats), access control checks must be explicitly added to every endpoint handler taking `project_id`. `get_review_graph_stats` had the check, but `get_review_graph` lacked it.
**Prevention:** Ensure all `/projects/{project_id}/...` endpoints explicitly invoke `check_project_access` at the start of the function body.
