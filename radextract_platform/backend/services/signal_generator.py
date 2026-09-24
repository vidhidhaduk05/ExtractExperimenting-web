"""Signal generation service: Hybrid MeSH + LLM topic-specific screening signal generation.

Generates structured signal lists for:
- population_signals
- intervention_signals
- study_type_signals
- hard_exclude_signals
- lenient_outcome_signals
- strict_outcome_signals

Caches generated signals in projects.signals_json.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional

from database import get_connection
from services.llm_extractor import is_llm_available
from services.search_string_generator import MESH_MAPPING, SYNONYM_MAP
from services.tool_calling_client import ToolCallingClient

logger = logging.getLogger("radextract.signal_generator")

UNIVERSAL_EDITORIAL_SIGNALS = [
    "editorial",
    "letter to the editor",
    "commentary",
    "erratum",
    "correction",
    "retraction",
]

UNIVERSAL_ANIMAL_SIGNALS = [
    "mouse model",
    "rat model",
    "murine",
    "animal model",
    "in vitro",
]


def _extract_mesh_baseline(pico: dict) -> dict[str, list[str]]:
    """Extract baseline signals from MESH_MAPPING and SYNONYM_MAP based on PICO terms."""
    pop_text = pico.get("population", "").lower()
    int_text = (pico.get("index_test", "") or pico.get("intervention", "")).lower()
    comp_text = pico.get("comparator", "").lower()
    out_text = pico.get("outcome", "").lower()
    design_text = pico.get("study_design", "").lower()

    pop_signals = set()
    int_signals = set()
    study_type_signals = set()
    hard_exclude_signals = set()
    lenient_outcome_signals = set()
    strict_outcome_signals = set()

    # Split into words/phrases
    def find_terms(text: str) -> set[str]:
        found = set()
        if not text:
            return found
        found.add(text.strip())
        # Split commas/semicolons
        for part in re.split(r"[,;]+", text):
            clean_part = part.strip()
            if clean_part and len(clean_part) > 2:
                found.add(clean_part)
        # Search MESH_MAPPING keys
        for k, v in MESH_MAPPING.items():
            if k in text:
                found.add(k)
                if isinstance(v, dict):
                    if "mesh" in v:
                        found.add(v["mesh"])
                    if "emtree" in v:
                        found.add(v["emtree"])
        # Search SYNONYM_MAP
        for k, syns in SYNONYM_MAP.items():
            if k in text or text in k:
                found.add(k)
                for s in syns:
                    found.add(s.lower())
        return found

    pop_signals.update(find_terms(pop_text))
    int_signals.update(find_terms(int_text))
    if comp_text:
        int_signals.update(find_terms(comp_text))
    
    if design_text:
        study_type_signals.update(find_terms(design_text))
    else:
        study_type_signals.update(["randomized", "rct", "controlled trial", "cohort", "prospective", "retrospective"])

    if out_text:
        out_terms = find_terms(out_text)
        lenient_outcome_signals.update(out_terms)
        strict_outcome_signals.update([t for t in out_terms if len(t.split()) > 1 or len(t) > 6])
    else:
        lenient_outcome_signals.update(["mortality", "survival", "death", "efficacy", "safety", "outcome"])
        strict_outcome_signals.update(["all-cause mortality", "cardiovascular death", "overall survival"])

    return {
        "population_signals": sorted(list(pop_signals)),
        "intervention_signals": sorted(list(int_signals)),
        "study_type_signals": sorted(list(study_type_signals)),
        "hard_exclude_signals": sorted(list(hard_exclude_signals)),
        "lenient_outcome_signals": sorted(list(lenient_outcome_signals)),
        "strict_outcome_signals": sorted(list(strict_outcome_signals)),
    }


def _call_llm_for_signals(pico: dict, inclusion: list, exclusion: list) -> Optional[dict]:
    """Use ToolCallingClient to generate augmented signals."""
    if not is_llm_available():
        return None

    prompt = f"""You are a systematic review screening specialist. Given the project PICO, inclusion criteria, and exclusion criteria, generate comprehensive, topic-specific screening signal keywords.

PICO:
- Population: {pico.get('population', '')}
- Intervention/Index Test: {pico.get('index_test', '') or pico.get('intervention', '')}
- Comparator: {pico.get('comparator', '')}
- Outcome: {pico.get('outcome', '')}
- Study Design: {pico.get('study_design', '')}

Inclusion Criteria:
{json.dumps(inclusion, indent=2)}

Exclusion Criteria:
{json.dumps(exclusion, indent=2)}

Return a single JSON object with these exact keys:
{{
  "population_signals": ["term1", "term2", ...],
  "intervention_signals": ["term1", "term2", ...],
  "study_type_signals": ["randomized", "rct", ...],
  "hard_exclude_signals": ["animal model", "pediatric", "case report", ...],
  "lenient_outcome_signals": ["mortality", "death", "survival", ...],
  "strict_outcome_signals": ["all-cause mortality", "cardiovascular death", ...]
}}
Output ONLY valid JSON."""

    try:
        client = ToolCallingClient()
        response_text = client.generate(prompt)
        # Parse JSON from response
        match = re.search(r"\{[\s\S]*\}", response_text)
        if match:
            data = json.loads(match.group(0))
            if isinstance(data, dict):
                return data
    except Exception as e:
        logger.warning("LLM signal generation failed: %s", e)
    return None


def generate_signals(
    project_id: str,
    db: Any = None,
    force: bool = False,
) -> dict:
    """Generate topic-specific screening signals using hybrid MeSH baseline + LLM augmentation.

    Returns:
        dict matching SignalSetResponse schema
    """
    close_db = False
    if db is None:
        db = get_connection()
        close_db = True

    try:
        # 1. Check existing cache if not force
        project_row = db.execute(
            "SELECT * FROM projects WHERE project_id = ?",
            (project_id,),
        ).fetchone()

        if not project_row:
            raise ValueError(f"Project '{project_id}' not found")

        p_dict = dict(project_row)
        existing_signals_str = p_dict.get("signals_json") or ""

        if not force and existing_signals_str:
            try:
                cached_data = json.loads(existing_signals_str)
                if isinstance(cached_data, dict) and "population_signals" in cached_data:
                    return {
                        "project_id": project_id,
                        "signals": cached_data,
                        "generated_at": datetime.now(timezone.utc).isoformat(),
                        "source": "cached",
                    }
            except Exception:
                pass

        # 2. Parse PICO and criteria
        pico = {}
        if p_dict.get("pico_json"):
            try:
                pico = json.loads(p_dict["pico_json"])
            except Exception:
                pico = {}

        inclusion = []
        if p_dict.get("inclusion_criteria_json"):
            try:
                inclusion = json.loads(p_dict["inclusion_criteria_json"])
            except Exception:
                inclusion = []

        exclusion = []
        if p_dict.get("exclusion_criteria_json"):
            try:
                exclusion = json.loads(p_dict["exclusion_criteria_json"])
            except Exception:
                exclusion = []

        # 3. Extract MeSH baseline
        baseline = _extract_mesh_baseline(pico)

        # 4. LLM augmentation
        llm_signals = _call_llm_for_signals(pico, inclusion, exclusion)
        source = "hybrid" if llm_signals else "mesh_only_fallback"

        merged: dict[str, set[str]] = {
            "population_signals": set(baseline.get("population_signals", [])),
            "intervention_signals": set(baseline.get("intervention_signals", [])),
            "study_type_signals": set(baseline.get("study_type_signals", [])),
            "hard_exclude_signals": set(baseline.get("hard_exclude_signals", [])),
            "lenient_outcome_signals": set(baseline.get("lenient_outcome_signals", [])),
            "strict_outcome_signals": set(baseline.get("strict_outcome_signals", [])),
        }

        if llm_signals:
            for k in merged:
                if k in llm_signals and isinstance(llm_signals[k], list):
                    for term in llm_signals[k]:
                        if isinstance(term, str) and term.strip():
                            merged[k].add(term.strip().lower())

        # 5. Add universal signals to hard_exclude_signals
        for term in UNIVERSAL_EDITORIAL_SIGNALS + UNIVERSAL_ANIMAL_SIGNALS:
            merged["hard_exclude_signals"].add(term.lower())

        # Format final cleaned dict
        final_signals = {
            k: sorted(list({t.strip().lower() for t in v if t and t.strip()}))
            for k, v in merged.items()
        }

        # 6. Cache to projects table
        db.execute(
            "UPDATE projects SET signals_json = ? WHERE project_id = ?",
            (json.dumps(final_signals), project_id),
        )
        if hasattr(db, "commit"):
            db.commit()

        return {
            "project_id": project_id,
            "signals": final_signals,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source": source,
        }
    finally:
        if close_db and hasattr(db, "close"):
            db.close()
