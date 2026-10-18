"""Reset a project's screening so it can be re-run from scratch.

Usage (from radextract_platform/backend, with the backend server STOPPED):
    python scripts/reset_screening.py <project_id>            # dry run: shows what would change
    python scripts/reset_screening.py <project_id> --apply    # backs up the DB, then resets
    python scripts/reset_screening.py <project_id> --apply --include-human   # also delete human decisions

What is reset: study screening status/stage/reason, all AI screening fields, AI screener decisions,
clarification questions and screening conflicts. Kept: studies, abstracts, PDFs, PICO, exclusion reasons,
screening keywords. Human reviewer decisions are only deleted with --include-human.
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import settings  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("project_id")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--include-human", action="store_true")
    args = ap.parse_args()

    conn = sqlite3.connect(settings.db_path, timeout=30)
    pid = args.project_id
    if not conn.execute("SELECT 1 FROM projects WHERE project_id = ?", (pid,)).fetchone():
        print(f"Project {pid} not found")
        return 1

    dec_filter = "" if args.include_human else " AND reviewer_id = 'ai_screener'"
    counts = {
        "studies to reset": conn.execute("SELECT COUNT(*) FROM studies WHERE project_id = ?", (pid,)).fetchone()[0],
        "screening_decisions to delete": conn.execute(
            f"SELECT COUNT(*) FROM screening_decisions WHERE project_id = ?{dec_filter}", (pid,)
        ).fetchone()[0],
        "clarification_questions to delete": conn.execute(
            "SELECT COUNT(*) FROM clarification_questions WHERE project_id = ?", (pid,)
        ).fetchone()[0],
        "screening_conflicts to delete": conn.execute(
            "SELECT COUNT(*) FROM screening_conflicts WHERE project_id = ?", (pid,)
        ).fetchone()[0],
    }
    for k, v in counts.items():
        print(f"  {k}: {v}")
    kept = conn.execute(
        "SELECT COUNT(*) FROM screening_decisions WHERE project_id = ? AND reviewer_id != 'ai_screener'", (pid,)
    ).fetchone()[0]
    if kept and not args.include_human:
        print(f"  human decisions kept: {kept} (use --include-human to delete them too)")

    if not args.apply:
        print("Dry run only. Re-run with --apply to make these changes.")
        return 0

    backup = Path(settings.db_path).with_name(f"{Path(settings.db_path).name}.bak-{datetime.now():%Y%m%d-%H%M%S}")
    dest = sqlite3.connect(backup)
    conn.backup(dest)
    dest.close()
    print(f"Backup written: {backup}")

    with conn:
        conn.execute(
            """UPDATE studies SET screening_status = 'pending', screening_stage = '', screening_reason = '',
               ai_confidence = 0.0, ai_decision = '', ai_reason = '', ai_reason_code = '',
               ai_screened_at = '', ai_stage = '' WHERE project_id = ?""",
            (pid,),
        )
        conn.execute(f"DELETE FROM screening_decisions WHERE project_id = ?{dec_filter}", (pid,))
        conn.execute("DELETE FROM clarification_questions WHERE project_id = ?", (pid,))
        conn.execute("DELETE FROM screening_conflicts WHERE project_id = ?", (pid,))
    print("Screening reset. Restart the backend and start screening again.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
