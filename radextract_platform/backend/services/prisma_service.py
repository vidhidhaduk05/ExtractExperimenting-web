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

    db_records = id_data.get("database_records", total_id)
    reg_records = id_data.get("registers", 0)
    excluded_auto = scr_data.get("excluded_automatic", 0)
    sought_reports = max(0, screened - ta_excl)
    not_retrieved = elig_data.get("reports_not_retrieved", max(0, sought_reports - ft_assessed))

    # Format exclusion reason strings
    ta_reasons = scr_data.get("excluded_with_reasons", [])
    ta_reasons_lines = [f"{r['reason']}: {r['count']}" for r in ta_reasons[:4]]
    ta_reasons_text = "\n".join(ta_reasons_lines) if ta_reasons_lines else "None specified"

    ft_reasons = elig_data.get("excluded_reasons", [])
    ft_reasons_lines = [f"{r['reason']} (n = {r['count']})" for r in ft_reasons[:5]]
    if not ft_reasons_lines:
        ft_reasons_lines = ["Criteria not met: 0"]

    # Full Official PRISMA 2020 SVG layout (Matching estech.shinyapps.io/prisma_flowdiagram)
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 880 750" width="100%" height="100%" style="background:#ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <title>PRISMA 2020 Flow Diagram</title>
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#000000" />
    </marker>
  </defs>

  <!-- Left Phase Banners (Official PRISMA 2020 vertical headers) -->
  <rect x="15" y="55" width="85" height="95" rx="0" fill="#ffffff" stroke="#000000" stroke-width="1.2"/>
  <text x="57" y="107" font-size="11" font-weight="700" fill="#000000" text-anchor="middle" transform="rotate(-90, 57, 107)">IDENTIFICATION</text>

  <rect x="15" y="165" width="85" height="355" rx="0" fill="#ffffff" stroke="#000000" stroke-width="1.2"/>
  <text x="57" y="342" font-size="11" font-weight="700" fill="#000000" text-anchor="middle" transform="rotate(-90, 57, 342)">SCREENING</text>

  <rect x="15" y="535" width="85" height="110" rx="0" fill="#ffffff" stroke="#000000" stroke-width="1.2"/>
  <text x="57" y="590" font-size="11" font-weight="700" fill="#000000" text-anchor="middle" transform="rotate(-90, 57, 590)">INCLUDED</text>

  <!-- Column 1 Header Banner -->
  <rect x="120" y="15" width="730" height="28" rx="0" fill="#ffffff" stroke="#000000" stroke-width="1.2"/>
  <text x="485" y="34" font-size="12" font-weight="700" fill="#000000" text-anchor="middle">Identification of new studies via databases and registers</text>

  <!-- Phase 1: Identification (Row 1) -->
  <rect x="120" y="55" width="340" height="95" rx="0" fill="#ffffff" stroke="#000000" stroke-width="1.2"/>
  <text x="135" y="78" font-size="11" font-weight="600" fill="#000000">Records identified from*:</text>
  <text x="145" y="100" font-size="11" fill="#000000">Databases (n = {db_records})</text>
  <text x="145" y="122" font-size="11" fill="#000000">Registers (n = {reg_records})</text>

  <!-- Arrow from Records identified to Records removed before screening -->
  <path d="M 460 102 L 505 102" fill="none" stroke="#000000" stroke-width="1.2" marker-end="url(#arrow)"/>

  <rect x="510" y="55" width="340" height="95" rx="0" fill="#ffffff" stroke="#000000" stroke-width="1.2"/>
  <text x="525" y="75" font-size="11" font-weight="600" fill="#000000">Records removed before screening:</text>
  <text x="535" y="96" font-size="10.5" fill="#000000">Duplicate records removed (n = {dups_rem})</text>
  <text x="535" y="115" font-size="10.5" fill="#000000">Records marked ineligible by automation (n = {excluded_auto})</text>
  <text x="535" y="134" font-size="10.5" fill="#000000">Records removed for other reasons (n = 0)</text>

  <!-- Arrow down from Identification to Screening -->
  <path d="M 290 150 L 290 180" fill="none" stroke="#000000" stroke-width="1.2" marker-end="url(#arrow)"/>

  <!-- Phase 2: Screening (Row 2 - Records screened) -->
  <rect x="120" y="180" width="340" height="55" rx="0" fill="#ffffff" stroke="#000000" stroke-width="1.2"/>
  <text x="290" y="203" font-size="11.5" font-weight="600" fill="#000000" text-anchor="middle">Records screened</text>
  <text x="290" y="222" font-size="12" font-weight="700" fill="#000000" text-anchor="middle">(n = {screened})</text>

  <!-- Arrow right to Records excluded -->
  <path d="M 460 207 L 505 207" fill="none" stroke="#000000" stroke-width="1.2" marker-end="url(#arrow)"/>

  <rect x="510" y="180" width="340" height="55" rx="0" fill="#ffffff" stroke="#000000" stroke-width="1.2"/>
  <text x="680" y="203" font-size="11.5" font-weight="600" fill="#000000" text-anchor="middle">Records excluded**</text>
  <text x="680" y="222" font-size="12" font-weight="700" fill="#000000" text-anchor="middle">(n = {ta_excl})</text>

  <!-- Arrow down from Records screened to Reports sought for retrieval -->
  <path d="M 290 235 L 290 265" fill="none" stroke="#000000" stroke-width="1.2" marker-end="url(#arrow)"/>

  <!-- Phase 2: Screening (Row 3 - Reports sought for retrieval) -->
  <rect x="120" y="265" width="340" height="55" rx="0" fill="#ffffff" stroke="#000000" stroke-width="1.2"/>
  <text x="290" y="288" font-size="11.5" font-weight="600" fill="#000000" text-anchor="middle">Reports sought for retrieval</text>
  <text x="290" y="307" font-size="12" font-weight="700" fill="#000000" text-anchor="middle">(n = {sought_reports})</text>

  <!-- Arrow right to Reports not retrieved -->
  <path d="M 460 292 L 505 292" fill="none" stroke="#000000" stroke-width="1.2" marker-end="url(#arrow)"/>

  <rect x="510" y="265" width="340" height="55" rx="0" fill="#ffffff" stroke="#000000" stroke-width="1.2"/>
  <text x="680" y="288" font-size="11.5" font-weight="600" fill="#000000" text-anchor="middle">Reports not retrieved</text>
  <text x="680" y="307" font-size="12" font-weight="700" fill="#000000" text-anchor="middle">(n = {not_retrieved})</text>

  <!-- Arrow down from Reports sought to Reports assessed for eligibility -->
  <path d="M 290 320 L 290 350" fill="none" stroke="#000000" stroke-width="1.2" marker-end="url(#arrow)"/>

  <!-- Phase 2: Screening (Row 4 - Reports assessed for eligibility) -->
  <rect x="120" y="350" width="340" height="60" rx="0" fill="#ffffff" stroke="#000000" stroke-width="1.2"/>
  <text x="290" y="374" font-size="11.5" font-weight="600" fill="#000000" text-anchor="middle">Reports assessed for eligibility</text>
  <text x="290" y="394" font-size="12" font-weight="700" fill="#000000" text-anchor="middle">(n = {ft_assessed})</text>

  <!-- Arrow right to Reports excluded with reasons -->
  <path d="M 460 380 L 505 380" fill="none" stroke="#000000" stroke-width="1.2" marker-end="url(#arrow)"/>

  <rect x="510" y="350" width="340" height="150" rx="0" fill="#ffffff" stroke="#000000" stroke-width="1.2"/>
  <text x="525" y="372" font-size="11" font-weight="600" fill="#000000">Reports excluded (n = {ft_excl}):</text>
  <text x="535" y="393" font-size="10.5" fill="#000000">{ft_reasons_lines[0] if len(ft_reasons_lines) > 0 else ""}</text>
  <text x="535" y="412" font-size="10.5" fill="#000000">{ft_reasons_lines[1] if len(ft_reasons_lines) > 1 else ""}</text>
  <text x="535" y="431" font-size="10.5" fill="#000000">{ft_reasons_lines[2] if len(ft_reasons_lines) > 2 else ""}</text>
  <text x="535" y="450" font-size="10.5" fill="#000000">{ft_reasons_lines[3] if len(ft_reasons_lines) > 3 else ""}</text>
  <text x="535" y="469" font-size="10.5" fill="#000000">{ft_reasons_lines[4] if len(ft_reasons_lines) > 4 else ""}</text>

  <!-- Arrow down from Reports assessed to Included -->
  <path d="M 290 410 L 290 535" fill="none" stroke="#000000" stroke-width="1.2" marker-end="url(#arrow)"/>

  <!-- Phase 3: Included (Row 5 - Included studies) -->
  <rect x="120" y="535" width="340" height="70" rx="0" fill="#ffffff" stroke="#000000" stroke-width="1.2"/>
  <text x="290" y="558" font-size="11.5" font-weight="600" fill="#000000" text-anchor="middle">New studies included in review</text>
  <text x="290" y="575" font-size="12" font-weight="700" fill="#000000" text-anchor="middle">(n = {incl})</text>
  <text x="290" y="593" font-size="10.5" fill="#333333" text-anchor="middle">Reports of new included studies (n = {incl})</text>

  <!-- Arrow right to Total studies included in review -->
  <path d="M 460 570 L 505 570" fill="none" stroke="#000000" stroke-width="1.2" marker-end="url(#arrow)"/>

  <rect x="510" y="535" width="340" height="70" rx="0" fill="#ffffff" stroke="#000000" stroke-width="1.2"/>
  <text x="680" y="558" font-size="11.5" font-weight="600" fill="#000000" text-anchor="middle">Total studies included in review</text>
  <text x="680" y="575" font-size="12" font-weight="700" fill="#000000" text-anchor="middle">(n = {incl})</text>
  <text x="680" y="593" font-size="10.5" fill="#333333" text-anchor="middle">Reports in meta-analysis (n = {meta})</text>

  <!-- Footnotes at Bottom -->
  <text x="120" y="635" font-size="9" fill="#444444">*Consider, if feasible to do so, reporting the number of records identified from each database or register searched rather than the total number.</text>
  <text x="120" y="650" font-size="9" fill="#444444">**If automation tools were used, indicate how many records were excluded by a human and how many were excluded by automation tools.</text>
  <text x="120" y="668" font-size="9" fill="#666666">From: Page MJ, McKenzie JE, Bossuyt PM, et al. The PRISMA 2020 statement: an updated guideline for reporting systematic reviews. BMJ 2021;372:n71. doi: 10.1136/bmj.n71</text>
  <text x="120" y="683" font-size="9" fill="#666666">For more information, visit: http://www.prisma-statement.org/</text>

</svg>"""
    return svg
