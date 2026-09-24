"""
Mermaid Diagram Generation Engine for RadExtract.
Adapted from K-Dense-AI markdown-mermaid-writing skill.
Generates live, git-diffable, compliant Mermaid syntax for PRISMA 2020 flows, Risk of Bias trees, and Meta-analysis synthesis pipelines.
"""
from typing import Dict, Any, List

def generate_prisma_flow_mermaid(
    identification_db: int = 1240,
    identification_registers: int = 35,
    duplicates_removed: int = 210,
    records_screened: int = 1065,
    records_excluded: int = 890,
    reports_sought: int = 175,
    reports_not_retrieved: int = 12,
    reports_assessed: int = 163,
    reports_excluded_reasons: Dict[str, int] = None,
    new_studies_included: int = 42,
) -> str:
    """Generate official PRISMA 2020 Flow Diagram in Mermaid flowchart LR / TD."""
    if reports_excluded_reasons is None:
        reports_excluded_reasons = {
            "Wrong intervention / comparator": 48,
            "Non-relevant clinical outcome": 36,
            "Inadequate study design / observational": 25,
            "Insufficient numerical outcome data": 12,
        }
    
    reasons_text = "<br/>".join([f"- {k}: {v}" for k, v in reports_excluded_reasons.items()])
    total_excluded_ft = sum(reports_excluded_reasons.values())

    return f"""flowchart TD
    accTitle: PRISMA 2020 Flow Diagram
    accDescr: Systematic review screening and selection flow according to PRISMA 2020 guidelines.

    subgraph Identification ["<b>Identification of studies via databases and registers</b>"]
        ID1["Records identified from databases<br/><b>(n = {identification_db})</b>"]
        ID2["Records identified from registers<br/><b>(n = {identification_registers})</b>"]
        DEDUP["Records removed before screening:<br/>Duplicate records removed <b>(n = {duplicates_removed})</b>"]
    end

    subgraph Screening ["<b>Screening Phase</b>"]
        SCR["Records screened (title / abstract)<br/><b>(n = {records_screened})</b>"]
        EXC_TITLE["Records excluded<br/><b>(n = {records_excluded})</b>"]
        SOUGHT["Reports sought for retrieval<br/><b>(n = {reports_sought})</b>"]
        NOT_RET["Reports not retrieved<br/><b>(n = {reports_not_retrieved})</b>"]
        ASSESS["Reports assessed for eligibility<br/><b>(n = {reports_assessed})</b>"]
        EXC_FT["Reports excluded <b>(n = {total_excluded_ft})</b>:<br/>{reasons_text}"]
    end

    subgraph Included ["<b>Included Studies</b>"]
        INC["Studies included in systematic review<br/><b>(n = {new_studies_included})</b>"]
    end

    ID1 & ID2 --> DEDUP
    DEDUP --> SCR
    SCR -->|Excluded| EXC_TITLE
    SCR -->|Selected| SOUGHT
    SOUGHT -->|Not retrieved| NOT_RET
    SOUGHT -->|Retrieved| ASSESS
    ASSESS -->|Excluded with reasons| EXC_FT
    ASSESS -->|Meets eligibility| INC

    style Identification fill:#EBF8FF,stroke:#2B6CB0,stroke-width:1.5px
    style Screening fill:#FEFCBF,stroke:#B7791F,stroke-width:1.5px
    style Included fill:#C6F6D5,stroke:#22543D,stroke-width:2px
    style INC fill:#9AE6B4,stroke:#22543D,font-weight:bold
"""

def generate_rob_hierarchy_mermaid(domains: List[Dict[str, Any]]) -> str:
    """Generate RoB 2.0 Domain Tree in Mermaid."""
    lines = [
        "graph LR",
        "    accTitle: Cochrane Risk of Bias 2.0 Domain Structure",
        "    ROOT[<b>Overall Risk of Bias</b>]"
    ]
    for i, d in enumerate(domains):
        d_id = d.get("domain_id", f"D{i+1}")
        d_name = d.get("domain_name", f"Domain {i+1}")
        judgment = d.get("judgment", "Unclear")
        color = "#C6F6D5" if judgment == "Low" else ("#FED7D7" if judgment == "High" else "#FEFCBF")
        lines.append(f'    ROOT --> {d_id}["<b>{d_id}: {d_name}</b><br/>Judgment: <i>{judgment}</i>"]')
        lines.append(f"    style {d_id} fill:{color},stroke:#2D3748,stroke-width:1.5px")
    
    return "\n".join(lines)
