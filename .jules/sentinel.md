## 2026-03-02 - Unreachable Authorization Checks Placed After Unconditional Statements

**Vulnerability:** In `list_project_highlights` (`/api/projects/{project_id}/pdf-highlights`), `check_project_access` was placed after an unconditional `raise HTTPException(status_code=404, detail="Project not found")` statement.
**Learning:** Authorization function calls placed after unconditional control flow jumps (`raise`, `return`) become unreachable dead code, causing authorization checks to be silently skipped or bypassed.
**Prevention:** Always place access control checks (`check_project_access`) prior to output/query execution, or ensure authorization functions are invoked before conditional jumps or returns.
