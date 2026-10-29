"""Sync project screening counts into the official PRISMA2020 flow diagram.

The Haddaway et al. Shiny app (https://estech.shinyapps.io/prisma_flowdiagram/)
and the PRISMA2020 R package read the same CSV template. Query-string names
match the template ``data`` column. This module fills those values from the
studies table so the official diagram opens already populated.

Box arithmetic follows the PRISMA 2020 flow. Records that are still awaiting
a decision are counted under "Reports not retrieved" so the published boxes
continue to add up. The official other-methods column has no duplicate box,
so duplicates found only on that arm are omitted and reported in ``notes``.
"""
from __future__ import annotations

import csv
import io
import logging
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple
from urllib.parse import quote, urlencode

logger = logging.getLogger(__name__)

SHINY_APP_URL = "https://estech.shinyapps.io/prisma_flowdiagram/"
CITATION = (
    "Haddaway, N. R., Page, M. J., Pritchard, C. C., & McGuinness, L. A. (2022). "
    "PRISMA2020: An R package and Shiny app for producing PRISMA 2020-compliant "
    "flow diagrams, with interactivity for optimised digital transparency and "
    "Open Synthesis. Campbell Systematic Reviews, 18, e1230. "
    "https://doi.org/10.1002/cl2.1230"
)
TEMPLATE_PATH = Path(__file__).resolve().parent / "prisma2020_template.csv"

_REASON_LIMIT = 12
_SOURCE_LIMIT = 12

_CITATION_HINTS = (
    "citation",
    "snowball",
    "reference list",
    "hand search",
    "handsearch",
    "backward",
    "forward citation",
)
_WEBSITE_HINTS = ("website", "web site", "google", "bing")
_ORGANISATION_HINTS = ("organisation", "organization", "society", "association")
_REGISTER_HINTS = (
    "clinicaltrials",
    "clinical trials",
    "ictrp",
    "isrctn",
    "anzctr",
    "euctr",
    "trial register",
    "prospero",
    "central",
)


def classify_source(source: Optional[str]) -> str:
    """Map a study source label onto a PRISMA 2020 information-source arm."""
    text = " ".join(str(source or "").lower().split())
    if not text:
        return "database"
    if any(hint in text for hint in _CITATION_HINTS):
        return "citation"
    if any(hint in text for hint in _WEBSITE_HINTS):
        return "website"
    if any(hint in text for hint in _ORGANISATION_HINTS):
        return "organisation"
    if any(hint in text for hint in _REGISTER_HINTS):
        return "register"
    return "database"


def _is_duplicate(row: Mapping[str, Any]) -> bool:
    return str(row.get("is_duplicate") or "").strip().lower() in {"1", "true"}


def _text(value: Any) -> str:
    return " ".join(str(value or "").split())


def _clean_label(value: str, fallback: str) -> str:
    cleaned = value.replace(",", " ").replace(";", " ")
    cleaned = " ".join(cleaned.split())
    return cleaned or fallback


def _is_automation(row: Mapping[str, Any]) -> bool:
    status = _text(row.get("screening_status")).lower()
    stage = _text(row.get("screening_stage")).lower()
    reason = _text(row.get("screening_reason")).lower()
    if status != "excluded" or stage == "ft":
        return False
    return "automation" in reason or "automated tool" in reason


def _outcome(row: Mapping[str, Any]) -> str:
    """Terminal box or status for one non-duplicate record."""
    if _is_automation(row):
        return "automation"
    status = _text(row.get("screening_status")).lower()
    stage = _text(row.get("screening_stage")).lower()
    ta_count = int(row.get("ta_decision_count") or 0)
    ft_count = int(row.get("ft_decision_count") or 0)

    # Has the study been screened at Title/Abstract?
    is_ta_screened = (
        ta_count > 0
        or status in ("included", "excluded")
        or stage == "ft"
    )
    if not is_ta_screened:
        return "pending_screening"

    # Screened at TA
    if status == "excluded" and stage != "ft":
        return "ta_excluded"

    # Full text stage
    is_ft_assessed = (
        ft_count > 0
        or (stage == "ft" and status in ("included", "excluded"))
    )
    if is_ft_assessed:
        if status == "included":
            return "included"
        if status == "excluded":
            return "ft_excluded"

    # Progressed past TA, but pending full-text retrieval/assessment
    return "pending_ft"


def _format_pairs(pairs: Sequence[Tuple[str, int]], fallback: str, limit: int) -> str:
    if not pairs:
        return "0"
    shown = list(pairs[:limit])
    rest = pairs[limit:]
    if rest:
        shown.append(("Other", sum(count for _, count in rest)))
    return "; ".join(f"{_clean_label(name, fallback)}, {count}" for name, count in shown)


def _reason_pairs(rows: Iterable[Mapping[str, Any]], prefix_ta: bool) -> List[Tuple[str, int]]:
    counts: Dict[str, int] = {}
    order: List[str] = []
    for row in rows:
        reason = _text(row.get("screening_reason")) or "Not specified"
        stage = _text(row.get("screening_stage")).lower()
        if prefix_ta and stage != "ft":
            reason = f"Title/abstract: {reason}"
        if reason not in counts:
            order.append(reason)
        counts[reason] = counts.get(reason, 0) + 1
    ranked = sorted(order, key=lambda name: (-counts[name], name.lower()))
    return [(name, counts[name]) for name in ranked]


def _source_pairs(rows: Iterable[Mapping[str, Any]]) -> List[Tuple[str, int]]:
    counts: Dict[str, int] = {}
    labels: Dict[str, str] = {}
    for row in rows:
        raw = _text(row.get("source")) or "Unspecified"
        key = raw.lower()
        labels.setdefault(key, raw)
        counts[key] = counts.get(key, 0) + 1
    ranked = sorted(counts, key=lambda key: (-counts[key], labels[key].lower()))
    return [(labels[key], counts[key]) for key in ranked]


def _named_sources(pairs: Sequence[Tuple[str, int]]) -> bool:
    return any(name.lower() != "unspecified" for name, _ in pairs)


def build_prisma2020_sync(
    studies: Sequence[Mapping[str, Any]],
    meta_studies: int = 0,
) -> Dict[str, Any]:
    """Build official PRISMA2020 field values from study rows."""
    dbr_database: List[Mapping[str, Any]] = []
    dbr_register: List[Mapping[str, Any]] = []
    other_rows: List[Tuple[str, Mapping[str, Any]]] = []
    other_duplicates = 0

    for row in studies:
        kind = classify_source(_text(row.get("source")))
        if kind in {"website", "organisation", "citation"}:
            if _is_duplicate(row):
                other_duplicates += 1
            else:
                other_rows.append((kind, row))
            continue
        if kind == "register":
            dbr_register.append(row)
        else:
            dbr_database.append(row)

    dbr_rows = dbr_database + dbr_register
    dbr_outcomes = [_outcome(row) if not _is_duplicate(row) else "duplicate" for row in dbr_rows]

    def dbr_count(name: str) -> int:
        return sum(1 for outcome in dbr_outcomes if outcome == name)

    duplicates = dbr_count("duplicate")
    excluded_automatic = dbr_count("automation")
    pending_screening = dbr_count("pending_screening")
    ta_excluded = dbr_count("ta_excluded")
    ft_excluded = dbr_count("ft_excluded")
    dbr_included = dbr_count("included")
    pending_ft = dbr_count("pending_ft")

    database_results = len(dbr_database)
    register_results = len(dbr_register)

    # Derived strictly from recorded events
    records_screened = ta_excluded + ft_excluded + dbr_included + pending_ft
    dbr_sought = ft_excluded + dbr_included + pending_ft
    dbr_assessed = ft_excluded + dbr_included
    dbr_notretrieved = pending_ft

    other_by_kind = {"website": [], "organisation": [], "citation": []}
    for kind, row in other_rows:
        other_by_kind[kind].append(row)
    other_flat = [row for _, row in other_rows]
    other_outcomes = [_outcome(row) for row in other_flat]
    other_pending_screening = sum(1 for outcome in other_outcomes if outcome == "pending_screening")
    other_ta_excluded = sum(1 for outcome in other_outcomes if outcome == "ta_excluded")
    other_ft_excluded = sum(1 for outcome in other_outcomes if outcome == "ft_excluded")
    other_included = sum(1 for outcome in other_outcomes if outcome == "included")
    other_pending_ft = sum(1 for outcome in other_outcomes if outcome == "pending_ft")
    other_sought = len(other_flat)
    other_notretrieved = other_pending_ft + other_pending_screening
    other_assessed = other_sought - other_notretrieved

    other_excluded_rows = [
        row for row, outcome in zip(other_flat, other_outcomes)
        if outcome in {"ta_excluded", "ft_excluded", "automation"}
    ]

    ft_rows = [
        row for row, outcome in zip(dbr_rows, dbr_outcomes) if outcome == "ft_excluded"
    ]
    total_studies = dbr_included + other_included
    total_studies_ma = max(0, min(int(meta_studies or 0), total_studies))

    db_pairs = _source_pairs(dbr_database)
    reg_pairs = _source_pairs(dbr_register)

    fields = {
        "previous_studies": "0",
        "previous_reports": "0",
        "database_results": str(database_results),
        "database_specific_results": _format_pairs(db_pairs, "Unspecified", _SOURCE_LIMIT),
        "register_results": str(register_results),
        "register_specific_results": _format_pairs(reg_pairs, "Unspecified", _SOURCE_LIMIT),
        "website_results": str(len(other_by_kind["website"])),
        "organisation_results": str(len(other_by_kind["organisation"])),
        "citations_results": str(len(other_by_kind["citation"])),
        "duplicates": str(duplicates),
        "excluded_automatic": str(excluded_automatic),
        "excluded_other": "0",
        "records_screened": str(records_screened),
        "records_excluded": str(ta_excluded),
        "dbr_sought_reports": str(dbr_sought),
        "dbr_notretrieved_reports": str(dbr_notretrieved),
        "other_sought_reports": str(other_sought),
        "other_notretrieved_reports": str(other_notretrieved),
        "dbr_assessed": str(dbr_assessed),
        "dbr_excluded": _format_pairs(_reason_pairs(ft_rows, prefix_ta=False), "Not specified", _REASON_LIMIT),
        "other_assessed": str(other_assessed),
        "other_excluded": _format_pairs(
            _reason_pairs(other_excluded_rows, prefix_ta=True), "Not specified", _REASON_LIMIT
        ),
        "new_studies": str(dbr_included),
        "new_reports": str(dbr_included),
        "total_studies": str(total_studies),
        "total_reports": str(total_studies),
        "total_studies_ma": str(total_studies_ma),
        "total_reports_ma": str(total_studies_ma),
    }
    options = {
        "previous": 0,
        "other": 1 if other_sought else 0,
        "dbDetail": 1 if _named_sources(db_pairs) else 0,
        "regDetail": 1 if register_results else 0,
        "metaAnalysis": 1 if total_studies_ma else 0,
    }
    notes: List[str] = []
    if pending_screening > 0 or other_pending_screening > 0:
        tot_pen = pending_screening + other_pending_screening
        notes.append(f"{tot_pen} record{'s' if tot_pen != 1 else ''} pending title/abstract screening.")
    if pending_ft > 0 or other_pending_ft > 0:
        tot_ft = pending_ft + other_pending_ft
        notes.append(
            f"{tot_ft} record{'s' if tot_ft != 1 else ''} awaiting full-text retrieval/assessment (Reports not retrieved in official PRISMA diagram)."
        )
    if other_duplicates:
        notes.append(
            f"{other_duplicates} duplicate record{'s' if other_duplicates != 1 else ''} "
            "from websites, organisations, or citation searching "
            f"{'are' if other_duplicates != 1 else 'is'} omitted from the official "
            "identification counts."
        )

    counts = {
        "database_results": database_results,
        "register_results": register_results,
        "duplicates": duplicates,
        "excluded_automatic": excluded_automatic,
        "records_screened": records_screened,
        "pending_screening": pending_screening,
        "records_excluded": ta_excluded,
        "dbr_sought_reports": dbr_sought,
        "dbr_notretrieved_reports": dbr_notretrieved,
        "dbr_assessed": dbr_assessed,
        "dbr_excluded": ft_excluded,
        "new_studies": dbr_included,
        "website_results": len(other_by_kind["website"]),
        "organisation_results": len(other_by_kind["organisation"]),
        "citations_results": len(other_by_kind["citation"]),
        "other_sought_reports": other_sought,
        "other_notretrieved_reports": other_notretrieved,
        "other_assessed": other_assessed,
        "other_excluded": len(other_excluded_rows),
        "other_included": other_included,
        "total_studies": total_studies,
        "total_studies_ma": total_studies_ma,
        "open_dbr": pending_ft + pending_screening,
        "open_other": other_pending_ft + other_pending_screening,
        "other_duplicates_omitted": other_duplicates,
        "pending_ft": pending_ft,
    }
    return {
        "app_url": SHINY_APP_URL,
        "shiny_url": build_shiny_url(fields, options),
        "citation": CITATION,
        "fields": fields,
        "options": options,
        "counts": counts,
        "notes": notes,
    }


def build_shiny_url(fields: Mapping[str, str], options: Mapping[str, int]) -> str:
    """URL that opens the official app with this project's counts filled in."""
    params: Dict[str, str] = {key: str(value) for key, value in options.items()}
    params.update({key: value for key, value in fields.items()})
    return SHINY_APP_URL + "?" + urlencode(params, quote_via=quote)


def load_template_rows() -> List[Dict[str, str]]:
    with TEMPLATE_PATH.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def render_prisma2020_csv(fields: Mapping[str, str]) -> str:
    """Official template CSV with the ``n`` column overwritten by live counts."""
    rows = load_template_rows()
    if not rows:
        raise ValueError("PRISMA2020 template is empty")
    fieldnames = list(rows[0].keys())
    for row in rows:
        key = (row.get("data") or "").strip()
        if key in fields:
            row["n"] = fields[key]
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fieldnames, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue()


def sync_prisma2020(project_id: str, db) -> Dict[str, Any]:
    """Load a project's studies and return the official PRISMA2020 payload."""
    study_rows = db.execute(
        """SELECT s.study_id, s.source, s.is_duplicate, s.screening_status, s.screening_stage,
                  s.screening_reason, s.pdf_status,
                  (SELECT COUNT(*) FROM screening_decisions sd WHERE sd.study_id = s.study_id AND sd.stage = 'ta') as ta_decision_count,
                  (SELECT COUNT(*) FROM screening_decisions sd WHERE sd.study_id = s.study_id AND sd.stage = 'ft') as ft_decision_count
           FROM studies s WHERE s.project_id = ?""",
        (project_id,),
    ).fetchall()
    studies = [dict(row) for row in study_rows]
    meta_studies = 0
    try:
        meta_row = db.execute(
            """SELECT COUNT(DISTINCT mas.study_id) as c
               FROM meta_analysis_studies mas
               JOIN meta_analyses ma ON mas.meta_id = ma.meta_id
               WHERE ma.project_id = ? AND mas.included = 1 AND mas.study_id != ''""",
            (project_id,),
        ).fetchone()
        if meta_row is not None:
            meta_studies = int(meta_row["c"] or 0)
    except Exception as exc:
        logger.warning("PRISMA2020 meta-analysis count unavailable: %s", exc)
    payload = build_prisma2020_sync(studies, meta_studies=meta_studies)
    payload["project_id"] = project_id
    return payload
