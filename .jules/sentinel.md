## 2026-03-31 - SVG XSS Sanitization
**Vulnerability:** Raw SVG strings from server/R-generated responses were rendered using `dangerouslySetInnerHTML` in `RobSummaryPage.tsx` and `PrismaFlowPage.tsx`.
**Learning:** `DOMParser` with `text/html` cleanly parses raw SVG markup, allowing removal of executable tags (`<script>`, `<iframe>`), inline event handlers (`onload`, `onerror`), and `javascript:` URIs without requiring third-party library additions.
**Prevention:** Always sanitize raw SVG strings via `sanitizeSvg` before rendering with `dangerouslySetInnerHTML`.

## 2026-04-01 - Subprocess Path Traversal Validation
**Vulnerability:** `call_r_script` and `call_r_script_bytes` in `r_plot_service.py` concatenated script names with `R_SCRIPTS_DIR` using `os.path.join`, permitting path traversal (e.g., `../`) to execute arbitrary scripts outside `R_SCRIPTS_DIR`.
**Learning:** `os.path.join` does not sanitize path traversal input. Resolving canonical absolute paths with `os.path.commonpath([r_scripts_dir, script_path]) == r_scripts_dir` guarantees that execution remains restricted within the designated directory.
**Prevention:** Always validate that target path resolves within the allowed directory using `os.path.commonpath` before opening or executing files from dynamic file names.

## 2026-10-23 - Resource Direct ID Authorization (IDOR)
**Vulnerability:** Endpoints taking direct resource IDs (`/api/pdf-highlights/{highlight_id}`) omitted project access checks (`check_project_access`), allowing unauthorized modification or deletion across projects.
**Learning:** Endpoints mapped directly to resource IDs bypass URL-based `project_id` path parameters, requiring an initial DB lookup for `project_id` to validate project permissions before execution.
**Prevention:** Always query the resource's `project_id` and call `check_project_access(conn, existing["project_id"], user)` on direct-resource mutation endpoints.

