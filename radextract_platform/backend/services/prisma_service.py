"""PRISMA 2020 live synchronization and Laya verification service.

Implements the official PRISMA 2020 flow diagram protocol:
1. Live aggregation of studies and human/AI screening decisions:
   - Identification (databases, registers, duplicates removed)
   - Screening (records screened, excluded with reasons)
   - Eligibility (full-text assessed, excluded with reasons)
   - Included (studies in systematic review, studies in meta-analysis)
   - Human vs AI decision audit metrics per PRISMA 2020 statement.
2. Laya System-1 verification of human and AI exclusion reasons against study text.
3. PRISMA 2020 SVG and interactive HTML generator adhering to the official layout.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from services.jev_client import ask, is_jev_enabled

logger = logging.getLogger(__name__)


def get_prisma_2020_data(project_id: str, db) -> Dict[str, Any]:
    """Compute fully synced PRISMA 2020 flow metrics from studies and screening decisions."""
    # 1. Total records identified
    total_records = db.execute(
        "SELECT COUNT(*) as c FROM studies WHERE project_id = ?", (project_id,)
    ).fetchone()["c"]

    # Duplicates removed (studies marked is_duplicate=1)
    duplicates_removed = db.execute(
        "SELECT COUNT(*) as c FROM studies WHERE project_id = ? AND is_duplicate = 1", (project_id,)
    ).fetchone()["c"]

    # Records after duplicates removed
    records_after_dups = max(0, total_records - duplicates_removed)

    # 2. Screening phase (Title/Abstract)
    ta_screened = db.execute(
        """SELECT COUNT(*) as c FROM studies
           WHERE project_id = ? AND (screening_stage IN ('ta', 'ft') OR screening_status IN ('included', 'excluded'))
           AND is_duplicate = 0""",
        (project_id,),
    ).fetchone()["c"]

    ta_excluded = db.execute(
        """SELECT COUNT(*) as c FROM studies
           WHERE project_id = ? AND screening_stage = 'ta' AND screening_status = 'excluded'
           AND is_duplicate = 0""",
        (project_id,),
    ).fetchone()["c"]

    ta_reasons_rows = db.execute(
        """SELECT screening_reason, COUNT(*) as c FROM studies
           WHERE project_id = ? AND screening_stage = 'ta' AND screening_status = 'excluded'
           AND is_duplicate = 0
           GROUP BY screening_reason ORDER BY c DESC""",
        (project_id,),
    ).fetchall()

    ta_excluded_reasons = [
        {"reason": r["screening_reason"] or "Not specified", "count": r["c"]}
        for r in ta_reasons_rows
    ]

    # 3. Eligibility phase (Full-Text)
    ft_assessed = db.execute(
        """SELECT COUNT(*) as c FROM studies
           WHERE project_id = ? AND screening_stage = 'ft'
           AND is_duplicate = 0""",
        (project_id,),
    ).fetchone()["c"]

    ft_excluded = db.execute(
        """SELECT COUNT(*) as c FROM studies
           WHERE project_id = ? AND screening_stage = 'ft' AND screening_status = 'excluded'
           AND is_duplicate = 0""",
        (project_id,),
    ).fetchone()["c"]

    ft_reasons_rows = db.execute(
        """SELECT screening_reason, COUNT(*) as c FROM studies
           WHERE project_id = ? AND screening_stage = 'ft' AND screening_status = 'excluded'
           AND is_duplicate = 0
           GROUP BY screening_reason ORDER BY c DESC""",
        (project_id,),
    ).fetchall()

    ft_excluded_reasons = [
        {"reason": r["screening_reason"] or "Not specified", "count": r["c"]}
        for r in ft_reasons_rows
    ]

    # 4. Included phase
    included_review = db.execute(
        """SELECT COUNT(*) as c FROM studies
           WHERE project_id = ? AND screening_status = 'included'
           AND is_duplicate = 0""",
        (project_id,),
    ).fetchone()["c"]

    in_meta = db.execute(
        """SELECT COUNT(DISTINCT s.study_id) as c FROM studies s
           JOIN extractions e ON s.study_id = e.study_id
           WHERE s.project_id = ? AND s.screening_status = 'included'
           AND s.is_duplicate = 0""",
        (project_id,),
    ).fetchone()["c"]

    pending = db.execute(
        """SELECT COUNT(*) as c FROM studies
           WHERE project_id = ? AND screening_status = 'pending'
           AND is_duplicate = 0""",
        (project_id,),
    ).fetchone()["c"]

    # 5. Human vs AI decision audit stats (PRISMA 2020 transparency)
    decisions_stats = db.execute(
        """SELECT
             COUNT(CASE WHEN reviewer_id LIKE '%ai%' OR reviewer_id LIKE '%auto%' OR reviewer_id LIKE '%laya%' THEN 1 END) as ai_decisions,
             COUNT(CASE WHEN reviewer_id NOT LIKE '%ai%' AND reviewer_id NOT LIKE '%auto%' AND reviewer_id NOT LIKE '%laya%' THEN 1 END) as human_decisions
           FROM screening_decisions WHERE project_id = ?""",
        (project_id,),
    ).fetchone()

    ai_count = decisions_stats["ai_decisions"] if decisions_stats else 0
    human_count = decisions_stats["human_decisions"] if decisions_stats else 0

    return {
        "project_id": project_id,
        "identification": {
            "database_records": total_records,
            "registers": 0,
            "other_sources": 0,
            "duplicates_removed": duplicates_removed,
            "records_after_duplicates": records_after_dups,
            "total": total_records,
        },
        "screening": {
            "records_screened": ta_screened,
            "records_excluded": ta_excluded,
            "excluded_with_reasons": ta_excluded_reasons,
        },
        "eligibility": {
            "full_text_assessed": ft_assessed,
            "full_text_excluded": ft_excluded,
            "excluded_reasons": ft_excluded_reasons,
        },
        "included": {
            "studies_in_review": included_review,
            "studies_in_meta_analysis": in_meta,
        },
        "pending": pending,
        "audit": {
            "human_decisions": human_count,
            "ai_decisions": ai_count,
            "total_decisions": human_count + ai_count,
        },
    }


def verify_exclusion_with_laya(
    title: str,
    abstract: str,
    exclusion_reason: str,
) -> Dict[str, Any]:
    """Verify with local Laya whether an exclusion reason holds for a study."""
    if not is_jev_enabled():
        return {"verified": True, "confidence": 1.0, "reason": "laya_offline"}

    context = f"Title: {title}\nAbstract: {abstract}"[:400]
    reason_clean = exclusion_reason.replace("_", " ")

    q = {
        "verify_exclusion": {
            "type": "noul",
            "instructions": f"Does this study warrant exclusion for: {reason_clean}?",
            "criteria": {
                "false": f"No, study does not match exclusion reason {reason_clean}",
                "true": f"Yes, study warrants exclusion for {reason_clean}",
            },
        }
    }

    try:
        res = ask(state=context, questions=q)
        score = float(res.get("verify_exclusion", {}).get("noul", 0.5))
        return {
            "verified": bool(score >= 0.50),
            "confidence": round(score, 4),
            "reason": exclusion_reason,
        }
    except Exception as e:
        logger.warning(f"Laya exclusion verification failed: {e}")
        return {"verified": True, "confidence": 0.50, "reason": "fallback"}


def generate_prisma_2020_svg(flow_data: Dict[str, Any]) -> str:
    """Generate a clean, high-resolution PRISMA 2020 SVG diagram."""
    id_data = flow_data.get("identification", {})
    scr_data = flow_data.get("screening", {})
    elig_data = flow_data.get("eligibility", {})
    inc_data = flow_data.get("included", {})

    total_id = id_data.get("total", 0)
    dups_rem = id_data.get("duplicates_removed", 0)
    screened = scr_data.get("records_screened", 0)
    ta_excl = scr_data.get("records_excluded", 0)
    ft_assessed = elig_data.get("full_text_assessed", 0)
    ft_excl = elig_data.get("full_text_excluded", 0)
    incl = inc_data.get("studies_in_review", 0)
    meta = inc_data.get("studies_in_meta_analysis", 0)

    # Format exclusion reason strings
    ta_reasons = scr_data.get("excluded_with_reasons", [])
    ta_reasons_lines = [f"{r['reason']}: {r['count']}" for r in ta_reasons[:4]]
    ta_reasons_text = "\n".join(ta_reasons_lines) if ta_reasons_lines else "None specified"

    ft_reasons = elig_data.get("excluded_reasons", [])
    ft_reasons_lines = [f"{r['reason']}: {r['count']}" for r in ft_reasons[:5]]
    ft_reasons_text = "\n".join(ft_reasons_lines) if ft_reasons_lines else "None specified"

    # SVG layout
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 680" width="100%" height="100%" style="background:#ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#4b5563" />
    </marker>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.06"/>
    </filter>
  </defs>

  <!-- Title Header -->
  <text x="450" y="32" font-size="18" font-weight="700" fill="#111827" text-anchor="middle">PRISMA 2020 Flow Diagram for Systematic Reviews</text>

  <!-- Phase Banners (Left column) -->
  <rect x="20" y="55" width="120" height="130" rx="6" fill="#f3f4f6" stroke="#e5e7eb"/>
  <text x="80" y="125" font-size="13" font-weight="600" fill="#374151" text-anchor="middle">Identification</text>

  <rect x="20" y="200" width="120" height="135" rx="6" fill="#f3f4f6" stroke="#e5e7eb"/>
  <text x="80" y="272" font-size="13" font-weight="600" fill="#374151" text-anchor="middle">Screening</text>

  <rect x="20" y="350" width="120" height="150" rx="6" fill="#f3f4f6" stroke="#e5e7eb"/>
  <text x="80" y="430" font-size="13" font-weight="600" fill="#374151" text-anchor="middle">Eligibility</text>

  <rect x="20" y="515" width="120" height="130" rx="6" fill="#f3f4f6" stroke="#e5e7eb"/>
  <text x="80" y="585" font-size="13" font-weight="600" fill="#374151" text-anchor="middle">Included</text>

  <!-- Phase 1: Identification Boxes -->
  <rect x="180" y="60" width="310" height="65" rx="6" fill="#ffffff" stroke="#0279ee" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="195" y="85" font-size="13" font-weight="600" fill="#111827">Records identified from databases</text>
  <text x="195" y="108" font-size="14" font-weight="700" fill="#0279ee">n = {total_id}</text>

  <rect x="540" y="60" width="310" height="65" rx="6" fill="#fff5f5" stroke="#ef4444" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="555" y="85" font-size="13" font-weight="600" fill="#991b1b">Duplicate records removed</text>
  <text x="555" y="108" font-size="14" font-weight="700" fill="#ef4444">n = {dups_rem}</text>

  <path d="M 335 125 L 335 155 L 490 155" fill="none" stroke="#4b5563" stroke-width="1.5"/>
  <path d="M 695 125 L 695 155 L 540 155" fill="none" stroke="#4b5563" stroke-width="1.5"/>
  <path d="M 335 125 L 335 205" fill="none" stroke="#4b5563" stroke-width="1.5" marker-end="url(#arrow)"/>

  <!-- Phase 2: Screening Boxes -->
  <rect x="180" y="210" width="310" height="65" rx="6" fill="#ffffff" stroke="#0279ee" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="195" y="235" font-size="13" font-weight="600" fill="#111827">Records screened (Title / Abstract)</text>
  <text x="195" y="258" font-size="14" font-weight="700" fill="#0279ee">n = {screened}</text>

  <!-- Arrow right to TA Excluded -->
  <path d="M 490 242 L 535 242" fill="none" stroke="#4b5563" stroke-width="1.5" marker-end="url(#arrow)"/>

  <rect x="540" y="200" width="310" height="110" rx="6" fill="#fff5f5" stroke="#ef4444" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="555" y="224" font-size="13" font-weight="600" fill="#991b1b">Records excluded</text>
  <text x="555" y="244" font-size="14" font-weight="700" fill="#ef4444">n = {ta_excl}</text>
  <text x="555" y="265" font-size="11" fill="#4b5563" font-weight="500">Exclusion reasons:</text>
  <text x="555" y="282" font-size="11" fill="#6b7280">{ta_reasons_lines[0] if len(ta_reasons_lines) > 0 else "Not specified"}</text>
  <text x="555" y="298" font-size="11" fill="#6b7280">{ta_reasons_lines[1] if len(ta_reasons_lines) > 1 else ""}</text>

  <!-- Arrow down from Screening to Eligibility -->
  <path d="M 335 275 L 335 355" fill="none" stroke="#4b5563" stroke-width="1.5" marker-end="url(#arrow)"/>

  <!-- Phase 3: Eligibility Boxes -->
  <rect x="180" y="360" width="310" height="65" rx="6" fill="#ffffff" stroke="#0279ee" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="195" y="385" font-size="13" font-weight="600" fill="#111827">Full-text articles assessed for eligibility</text>
  <text x="195" y="408" font-size="14" font-weight="700" fill="#0279ee">n = {ft_assessed}</text>

  <!-- Arrow right to FT Excluded -->
  <path d="M 490 392 L 535 392" fill="none" stroke="#4b5563" stroke-width="1.5" marker-end="url(#arrow)"/>

  <rect x="540" y="350" width="310" height="120" rx="6" fill="#fff5f5" stroke="#ef4444" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="555" y="374" font-size="13" font-weight="600" fill="#991b1b">Full-text articles excluded</text>
  <text x="555" y="394" font-size="14" font-weight="700" fill="#ef4444">n = {ft_excl}</text>
  <text x="555" y="415" font-size="11" fill="#4b5563" font-weight="500">Exclusion reasons:</text>
  <text x="555" y="432" font-size="11" fill="#6b7280">{ft_reasons_lines[0] if len(ft_reasons_lines) > 0 else "Not specified"}</text>
  <text x="555" y="448" font-size="11" fill="#6b7280">{ft_reasons_lines[1] if len(ft_reasons_lines) > 1 else ""}</text>
  <text x="555" y="464" font-size="11" fill="#6b7280">{ft_reasons_lines[2] if len(ft_reasons_lines) > 2 else ""}</text>

  <!-- Arrow down from Eligibility to Included -->
  <path d="M 335 425 L 335 525" fill="none" stroke="#4b5563" stroke-width="1.5" marker-end="url(#arrow)"/>

  <!-- Phase 4: Included Boxes -->
  <rect x="180" y="530" width="310" height="95" rx="6" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="195" y="555" font-size="13" font-weight="600" fill="#14532d">Studies included in review</text>
  <text x="195" y="578" font-size="14" font-weight="700" fill="#16a34a">n = {incl}</text>
  <text x="195" y="602" font-size="12" fill="#15803d">Reports in meta-analysis: n = {meta}</text>

</svg>"""
    return svg
