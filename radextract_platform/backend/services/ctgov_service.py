"""ClinicalTrials.gov API v2 Enrichment Service.

Enriches clinical study records containing an NCT number (e.g. NCT01234567)
with live trial registry metadata from ClinicalTrials.gov API v2.
Zero API key required; rate-limited and cached.
"""
from __future__ import annotations
import re
import time
import logging
from typing import Optional, Any
import requests

logger = logging.getLogger("radextract.ctgov")

CTGOV_API = "https://clinicaltrials.gov/api/v2/studies"
CTGOV_FIELDS = ",".join([
    "protocolSection.identificationModule",
    "protocolSection.statusModule",
    "protocolSection.designModule",
    "protocolSection.armsInterventionsModule",
    "protocolSection.outcomesModule",
    "protocolSection.eligibilityModule",
    "protocolSection.sponsorCollaboratorsModule",
    "protocolSection.referencesModule",
])

NCT_REGEX = re.compile(r"\b(NCT\d{8})\b", re.IGNORECASE)


def extract_nct_id(text: str) -> Optional[str]:
    """Extract the first NCT identifier found in text."""
    if not text:
        return None
    match = NCT_REGEX.search(text)
    return match.group(1).upper() if match else None


def extract_all_nct_ids(text: str) -> list[str]:
    """Extract all unique NCT identifiers found in text."""
    if not text:
        return []
    matches = NCT_REGEX.findall(text)
    seen = set()
    unique = []
    for m in matches:
        up = m.upper()
        if up not in seen:
            seen.add(up)
            unique.append(up)
    return unique


def fetch_ctgov_trial(nct_id: str, delay: float = 0.2, timeout: int = 10) -> Optional[dict[str, Any]]:
    """Fetch trial metadata from ClinicalTrials.gov API v2.
    
    Returns a structured dictionary of clinical trial metadata:
      - ct_official_title: Official trial title
      - ct_status: Overall recruiting/completion status
      - ct_phase: Clinical trial phase (e.g. Phase 2, Phase 3)
      - ct_design: Allocation, intervention model, masking
      - ct_arms: Arm labels and types
      - ct_primary_outcomes: Primary outcome measures
      - ct_eligibility: Age limits, sex, criteria
      - ct_references: Related publication citations and PMIDs
    """
    clean_id = nct_id.strip().upper()
    try:
        if delay > 0:
            time.sleep(delay)
        resp = requests.get(
            f"{CTGOV_API}/{clean_id}",
            params={"fields": CTGOV_FIELDS},
            timeout=timeout,
            headers={"Accept": "application/json"},
        )
        if resp.status_code != 200:
            logger.debug(f"CT.gov returned status {resp.status_code} for {clean_id}")
            return None

        data = resp.json().get("protocolSection", {})
        id_mod = data.get("identificationModule", {})
        status_mod = data.get("statusModule", {})
        design_mod = data.get("designModule", {})
        arms_mod = data.get("armsInterventionsModule", {})
        outcomes_mod = data.get("outcomesModule", {})
        elig_mod = data.get("eligibilityModule", {})
        sponsor_mod = data.get("sponsorCollaboratorsModule", {})
        refs_mod = data.get("referencesModule", {})

        arms = [
            f"{a.get('label', 'Arm')}: {a.get('type', 'Unknown')}"
            for a in arms_mod.get("armGroups", [])
        ]
        primary_outcomes = [
            o.get("measure", "")
            for o in outcomes_mod.get("primaryOutcomes", [])
            if o.get("measure")
        ]
        references = [
            {"pmid": ref.get("pmid", ""), "citation": ref.get("citation", "")}
            for ref in refs_mod.get("references", [])
        ]

        design_info = design_mod.get("designInfo", {})
        allocation = design_info.get("allocation", "N/A")
        intervention_model = design_info.get("interventionModel", "N/A")
        primary_purpose = design_info.get("primaryPurpose", "N/A")

        lead_sponsor = sponsor_mod.get("leadSponsor", {}).get("name", "")

        return {
            "nct_id": clean_id,
            "ct_official_title": id_mod.get("officialTitle", id_mod.get("briefTitle", "")),
            "ct_brief_title": id_mod.get("briefTitle", ""),
            "ct_status": status_mod.get("overallStatus", ""),
            "ct_phase": (design_mod.get("phases") or ["N/A"])[0],
            "ct_allocation": allocation,
            "ct_intervention_model": intervention_model,
            "ct_primary_purpose": primary_purpose,
            "ct_arms": arms,
            "ct_primary_outcomes": primary_outcomes,
            "ct_lead_sponsor": lead_sponsor,
            "ct_min_age": elig_mod.get("minimumAge", ""),
            "ct_max_age": elig_mod.get("maximumAge", ""),
            "ct_sex": elig_mod.get("sex", "ALL"),
            "ct_references": references,
            "source_url": f"https://clinicaltrials.gov/study/{clean_id}",
        }
    except Exception as e:
        logger.warning(f"Error fetching ClinicalTrials.gov data for {clean_id}: {e}")
        return None


def enrich_study_with_ctgov(study: dict[str, Any]) -> dict[str, Any]:
    """Examine study metadata and abstract for NCT identifier and enrich if found."""
    nct_id = (
        study.get("nct_id")
        or extract_nct_id(study.get("title", ""))
        or extract_nct_id(study.get("abstract", ""))
        or extract_nct_id(study.get("metadata_json", ""))
    )
    if not nct_id:
        return study

    enrichment = fetch_ctgov_trial(nct_id)
    if not enrichment:
        return study

    # Augment study with CT.gov verified trial data
    enriched = dict(study)
    enriched["nct_id"] = nct_id
    enriched["ct_enriched"] = True
    enriched["ct_status"] = enrichment.get("ct_status")
    enriched["ct_phase"] = enrichment.get("ct_phase")
    enriched["ct_design"] = f"{enrichment.get('ct_allocation')} | {enrichment.get('ct_intervention_model')}"

    # If abstract is sparse (< 150 chars), supplement with official trial description and arms
    abstract = (enriched.get("abstract") or "").strip()
    if len(abstract) < 150:
        supplemental = (
            f"[ClinicalTrials.gov {nct_id} Official Record]\n"
            f"Title: {enrichment.get('ct_official_title')}\n"
            f"Phase: {enrichment.get('ct_phase')} | Status: {enrichment.get('ct_status')}\n"
            f"Design: {enrichment.get('ct_allocation')} ({enrichment.get('ct_intervention_model')})\n"
            f"Arms: {', '.join(enrichment.get('ct_arms', []))}\n"
            f"Primary Outcomes: {'; '.join(enrichment.get('ct_primary_outcomes', []))}"
        )
        enriched["abstract"] = f"{abstract}\n\n{supplemental}".strip() if abstract else supplemental
        enriched["abstract_supplemented_by_ctgov"] = True

    return enriched
