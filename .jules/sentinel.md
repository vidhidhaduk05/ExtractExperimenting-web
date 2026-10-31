## 2026-03-31 - SVG XSS Sanitization
**Vulnerability:** Raw SVG strings from server/R-generated responses were rendered using `dangerouslySetInnerHTML` in `RobSummaryPage.tsx` and `PrismaFlowPage.tsx`.
**Learning:** `DOMParser` with `text/html` cleanly parses raw SVG markup, allowing removal of executable tags (`<script>`, `<iframe>`), inline event handlers (`onload`, `onerror`), and `javascript:` URIs without requiring third-party library additions.
**Prevention:** Always sanitize raw SVG strings via `sanitizeSvg` before rendering with `dangerouslySetInnerHTML`.

## 2026-04-01 - Subprocess Path Traversal Validation
**Vulnerability:** `call_r_script` and `call_r_script_bytes` in `r_plot_service.py` concatenated script names with `R_SCRIPTS_DIR` using `os.path.join`, permitting path traversal (e.g., `../`) to execute arbitrary scripts outside `R_SCRIPTS_DIR`.
**Learning:** `os.path.join` does not sanitize path traversal input. Resolving canonical absolute paths with `os.path.commonpath([r_scripts_dir, script_path]) == r_scripts_dir` guarantees that execution remains restricted within the designated directory.
**Prevention:** Always validate that target path resolves within the allowed directory using `os.path.commonpath` before opening or executing files from dynamic file names.

## 2026-04-02 - BOLA in Scientific Export Endpoints
**Vulnerability:** `/api/scientific-export/bibliography` and `/api/scientific-export/draft-manuscript` took `project_id` in request bodies without validating user access, allowing unauthorized users to export private study bibliographies and generate draft manuscripts for arbitrary projects.
**Learning:** Export endpoints that accept request body payloads rather than path parameters can easily bypass generic path-based middleware and must explicitly inject `user = Depends(get_current_user_optional)` and call `check_project_access(conn, req.project_id, user)`.
**Prevention:** In every router handling project-scoped resources (whether via path parameter or JSON body), explicitly enforce `check_project_access` before querying or returning data.
