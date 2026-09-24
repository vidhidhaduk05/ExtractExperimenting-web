"""Seed script: load the example diagnostic accuracy study and run a full RoB assessment.

Example study: PMC11370816
  Title: "Assessment of the Diagnostic Accuracy of CT as Compared to MRI
          in Detecting Metastases in Patients With Colorectal Cancer"
  Author: Qaed S Alhammami
  Journal: Cureus, 2024 Aug; 16(8): e66125
  DOI: 10.7759/cureus.66125
  PMID: 39229423
  License: CC-BY 4.0

This script:
  1. Creates a systematic review project with PICOS framework
  2. Imports the example study with full metadata
  3. Auto-selects QUADAS-2 (based on "diagnostic accuracy" study design)
  4. Creates a RoB assessment with all 4 domains and 11 signaling questions
  5. Runs mock AI pre-fill using the study abstract
  6. Accepts AI suggestions (researcher-in-the-loop)
  7. Prints a detailed summary of the assessment results

Usage:
  cd /workspace/radextract_platform/backend
  python seed_example_study.py
"""
from __future__ import annotations
import json
import os
import sys

# Ensure backend dir is on path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import reset_db, init_db, get_connection
from services import rob_service, rob_ai
from services.rob_tools import select_rob_tool, get_tool, tool_to_dict, get_judgment_label, get_judgment_color


# ── Study metadata (from PMC/PubMed) ──

STUDY_METADATA = {
    "title": "Assessment of the Diagnostic Accuracy of CT as Compared to MRI "
             "in Detecting Metastases in Patients With Colorectal Cancer",
    "authors": "Qaed S Alhammami",
    "publication_year": 2024,
    "journal": "Cureus",
    "volume": "16",
    "issue": "8",
    "pages": "e66125",
    "doi": "10.7759/cureus.66125",
    "pmid": "39229423",
    "pmcid": "PMC11370816",
    "source": "PubMed Central",
    "study_design": "diagnostic accuracy",
    "abstract": (
        "This study aimed to compare the diagnostic accuracy of computed tomography (CT) "
        "and magnetic resonance imaging (MRI) in detecting metastases of colorectal cancer "
        "(CRC) in a hospital in Najran, Saudi Arabia. A total of 51 patients with CRC were "
        "included in the study. The radiological findings of metastatic lesions and the "
        "diagnostic accuracy measures of CT compared to MRI were analyzed. The results showed "
        "that CT had a false negative rate of 7.8%, a false positive rate of 7.8%, a true "
        "negative rate of 27.5%, and a true positive rate of 56.9% in detecting metastases. "
        "Diagnostic accuracy measures varied based on the number of metastatic lesions, with "
        "higher sensitivity observed for cases with fewer lesions. Gender, timing of imaging "
        "in relation to surgical intervention, and administration of nonsurgical therapy showed "
        "significant associations with diagnosis mismatch between CT and MRI. The site of "
        "metastases and the site of the primary tumor in the colon also demonstrated significant "
        "associations with diagnosis mismatch. The size of the largest metastasis detected by "
        "MRI was significantly associated with diagnosis mismatch. The overall diagnostic "
        "accuracy of CT in detecting any metastases, compared to MRI as the reference standard, "
        "was estimated to have a sensitivity of 87.8%, a specificity of 77.8%, a positive "
        "predictive value of 87.8%, and a negative predictive value of 77.8%. This study "
        "provides valuable insights into the comparative diagnostic performance of CT and MRI "
        "in detecting metastases of CRC, highlighting the importance of considering patient "
        "characteristics, disease outcome, and tumor characteristics in the interpretation of "
        "imaging results."
    ),
}

# ── PICOS framework for the systematic review ──

PICOS = {
    "population": "Patients with colorectal cancer (CRC) undergoing imaging for metastasis detection",
    "index_test": "Computed tomography (CT)",
    "comparator": "Magnetic resonance imaging (MRI) as reference standard",
    "outcome": "Diagnostic accuracy (sensitivity, specificity, PPV, NPV) for detecting metastases",
    "study_design": "Diagnostic accuracy studies (retrospective or prospective)",
}


def seed():
    """Run the full seed sequence."""
    print("=" * 72)
    print("  RadExtract Platform — Example Study Seed")
    print("  Study: PMC11370816 (Alhammami 2024, Cureus)")
    print("=" * 72)

    # ── Step 1: Reset and initialize database ──
    print("\n[1/7] Initializing database...")
    reset_db()
    init_db()
    print("  ✓ Database initialized")

    # ── Step 2: Create project with PICOS ──
    print("\n[2/7] Creating systematic review project...")
    import uuid
    project_id = str(uuid.uuid4())
    conn = get_connection()
    try:
        conn.execute(
            """INSERT INTO projects
               (project_id, name, description, pico_json, hypothesis, research_question)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                project_id,
                "CT vs MRI for Metastasis Detection in Colorectal Cancer",
                "Systematic review comparing the diagnostic accuracy of CT and MRI "
                "for detecting metastases in patients with colorectal cancer.",
                json.dumps(PICOS, indent=2),
                "CT has comparable diagnostic accuracy to MRI for detecting metastases "
                "in colorectal cancer patients.",
                "What is the diagnostic accuracy of CT compared to MRI for detecting "
                "metastases in patients with colorectal cancer?",
            ),
        )
        conn.commit()
    finally:
        conn.close()
    print(f"  ✓ Project created: {project_id}")
    print(f"    PICOS: {json.dumps(PICOS, indent=4)}")

    # ── Step 3: Import the example study ──
    print("\n[3/7] Importing example study...")
    study_id = str(uuid.uuid4())
    conn = get_connection()
    try:
        conn.execute(
            """INSERT INTO studies
               (study_id, project_id, title, authors, publication_year, journal,
                doi, pmid, abstract, source, study_design, metadata_json,
                screening_status, screening_stage)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'included', 'ft')""",
            (
                study_id, project_id,
                STUDY_METADATA["title"], STUDY_METADATA["authors"],
                STUDY_METADATA["publication_year"], STUDY_METADATA["journal"],
                STUDY_METADATA["doi"], STUDY_METADATA["pmid"],
                STUDY_METADATA["abstract"], STUDY_METADATA["source"],
                STUDY_METADATA["study_design"],
                json.dumps({
                    "pmcid": STUDY_METADATA["pmcid"],
                    "volume": STUDY_METADATA["volume"],
                    "issue": STUDY_METADATA["issue"],
                    "pages": STUDY_METADATA["pages"],
                }),
            ),
        )
        conn.commit()
    finally:
        conn.close()
    print(f"  ✓ Study imported: {study_id}")
    print(f"    Title: {STUDY_METADATA['title']}")
    print(f"    Author: {STUDY_METADATA['authors']}")
    print(f"    Journal: {STUDY_METADATA['journal']} ({STUDY_METADATA['publication_year']})")
    print(f"    DOI: {STUDY_METADATA['doi']}")
    print(f"    PMID: {STUDY_METADATA['pmid']}")
    print(f"    Study design: {STUDY_METADATA['study_design']}")

    # ── Step 4: Auto-select RoB tool ──
    print("\n[4/7] Auto-selecting RoB tool...")
    selected_tool = select_rob_tool(STUDY_METADATA["study_design"])
    tool = get_tool(selected_tool)
    print(f"  ✓ Selected: {tool.name} — {tool.full_name}")
    print(f"    Reason: study design '{STUDY_METADATA['study_design']}' → {selected_tool}")
    print(f"    Domains: {len(tool.domains)}")
    total_sqs = sum(len(d.signaling_questions) for d in tool.domains)
    print(f"    Signaling questions: {total_sqs}")

    # ── Step 5: Create RoB assessment ──
    print("\n[5/7] Creating RoB assessment...")
    assessment = rob_service.create_assessment(
        study_id=study_id,
        project_id=project_id,
        tool=selected_tool,
        outcome_label="Detection of any metastasis (CT vs MRI)",
        assessed_by="seed_script",
    )
    aid = assessment["assessment_id"]
    print(f"  ✓ Assessment created: {aid}")
    print(f"    Overall judgment: {assessment['overall_judgment']}")
    for dj in assessment["domain_judgments"]:
        sq_count = len(dj["signaling_answers"])
        print(f"    Domain: {dj['domain_label']} ({sq_count} signaling questions)")

    # ── Step 6: Run AI pre-fill (mock) ──
    print("\n[6/7] Running AI pre-fill (mock model_fn)...")
    ai_results = rob_ai.prefill_assessment(
        tool_key=selected_tool,
        study_metadata=STUDY_METADATA,
        abstract=STUDY_METADATA["abstract"],
        model_fn=rob_ai.mock_model_fn,
    )
    prefill_result = rob_service.apply_ai_prefill(aid, ai_results)
    print(f"  ✓ AI pre-fill complete:")
    print(f"    Domains pre-filled: {prefill_result['domains_prefilled']}")
    print(f"    Questions pre-filled: {prefill_result['questions_prefilled']}")
    print(f"    Average confidence: {prefill_result['avg_confidence']}")
    print(f"    Used full text: {prefill_result['used_full_text']}")
    if prefill_result["warnings"]:
        for w in prefill_result["warnings"]:
            print(f"    Warning: {w}")

    # ── Step 7: Accept AI suggestions and print summary ──
    print("\n[7/7] Accepting AI suggestions (researcher-in-the-loop)...")
    accept_result = rob_service.accept_ai_suggestions(aid, verified_by="researcher1")
    print(f"  ✓ Accepted {accept_result['answers_accepted']} AI-suggested answers")

    # Get final assessment
    final = rob_service.get_assessment(aid)
    print("\n" + "=" * 72)
    print("  FINAL ASSESSMENT SUMMARY")
    print("=" * 72)
    print(f"\n  Study: {STUDY_METADATA['title']}")
    print(f"  Tool: {final['tool']}")
    print(f"  Outcome: {final['outcome_label']}")
    print(f"  Overall judgment: {get_judgment_label(final['overall_judgment'])}")
    print(f"  AI pre-filled: {'Yes' if final['ai_prefilled'] else 'No'}")

    print(f"\n  Domain Judgments:")
    print(f"  {'Domain':<30} {'Judgment':<15} {'AI Suggested':<15} {'Confidence':<10} {'Verified'}")
    print(f"  {'-'*30} {'-'*15} {'-'*15} {'-'*10} {'-'*8}")
    for dj in final["domain_judgments"]:
        judgment = get_judgment_label(dj["risk_judgment"]) if dj["risk_judgment"] else "—"
        ai_sug = get_judgment_label(dj["ai_suggested"]) if dj["ai_suggested"] else "—"
        conf = f"{dj['ai_confidence']:.2f}" if dj["ai_confidence"] > 0 else "—"
        verified = "✓" if dj["human_verified"] else "○"
        print(f"  {dj['domain_label']:<30} {judgment:<15} {ai_sug:<15} {conf:<10} {verified}")

    print(f"\n  Signaling Question Answers:")
    for dj in final["domain_judgments"]:
        print(f"\n  [{dj['domain_label']}]")
        for sa in dj["signaling_answers"]:
            answer = sa["answer"] if sa["answer"] else "—"
            ai_answer = sa["ai_answer"] if sa["ai_answer"] else "—"
            ai_conf = f"{sa['ai_confidence']:.2f}" if sa["ai_confidence"] > 0 else "—"
            quote = (sa["ai_quote"][:60] + "...") if len(sa.get("ai_quote", "")) > 60 else sa.get("ai_quote", "")
            print(f"    {sa['question_key']}: answer={answer:<12} AI={ai_answer:<12} conf={ai_conf:<6} quote=\"{quote}\"")

    # Project summary
    summary = rob_service.get_project_summary(project_id)
    print(f"\n  Project Summary:")
    print(f"    Total assessments: {summary['total_assessments']}")
    print(f"    Judgment distribution: {summary['judgment_counts']}")

    print("\n" + "=" * 72)
    print("  Seed complete. The platform is ready for testing.")
    print(f"  Project ID: {project_id}")
    print(f"  Study ID: {study_id}")
    print(f"  Assessment ID: {aid}")
    print("=" * 72)

    return {
        "project_id": project_id,
        "study_id": study_id,
        "assessment_id": aid,
    }


if __name__ == "__main__":
    result = seed()
