"""Database initialization and seeding script for RadExtract Platform.

Usage:
    python seed.py
    docker compose exec api python seed.py
    python -m radextract_platform.backend.seed

This script is completely idempotent:
  1. Initializes SQLite schema and column migrations (with WAL mode).
  2. Creates the default admin/owner user if not present.
  3. Validates RoB tools registry.
  4. Seeds an initial systematic review project with studies, screening keywords,
     and extraction codebook variables if database is empty.
"""
from __future__ import annotations
import os
import sys
import uuid
from pathlib import Path

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from config import settings, ensure_dirs
from database import init_db, get_connection
from dependencies import hash_password, create_user
from services.db_backend import SQLiteBackend
from services.rob_tools import TOOLS, list_tools


def seed_database():
    print("=" * 60)
    print("RadExtract Platform — Initializing and Seeding Database")
    print("=" * 60)
    
    ensure_dirs()
    init_db()
    
    raw_conn = get_connection()
    db = SQLiteBackend(raw_conn)
    
    # ── 1. Admin User ──
    admin_username = os.environ.get("ADMIN_USERNAME", "admin").strip()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123").strip()
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@radextract.local").strip()
    
    existing_admin = db.query("users", {"username": admin_username})
    
    if not existing_admin:
        print(f"[+] Creating admin user: '{admin_username}' (role: owner)...")
        create_user(
            username=admin_username,
            password=admin_password,
            email=admin_email,
            role="owner",
            db=db,
        )
        print(f"    Admin user '{admin_username}' created successfully.")
    else:
        print(f"[*] Admin user '{admin_username}' already exists.")

    # ── 2. RoB Tools Verification ──
    available_tools = list_tools()
    print(f"[*] Verified {len(available_tools)} RoB tools in registry:")
    for t in available_tools:
        print(f"    - {t.key}: {t.name} ({len(t.domains)} domains)")

    # ── 3. Seed Research Project (if empty) ──
    existing_projects = db.query_all("projects", limit=1)
    
    project_id = "proj_pam_current"
    if not existing_projects:
        print("\n[+] Seeding default systematic review project...")
        proj_name = "Pure Arterial Malformations of the Brain (PAM)"
        proj_desc = "A Systematic Review of Angioarchitecture, Aneurysm Association, and Stroke Outcomes"
        pico_json = (
            '{"population": "Patients with intracranial pure arterial malformations (PAM)", '
            '"intervention": "Endovascular intervention or surgical management", '
            '"comparator": "Conservative management or natural history", '
            '"outcomes": "Hemorrhage rate, aneurysm association, stroke occurrence, angioarchitecture features"}'
        )
        
        db.execute(
            """INSERT INTO projects (
                project_id, name, description, pico_json, hypothesis,
                research_question, status, auto_rob_enabled, rob_confidence_threshold
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                project_id,
                proj_name,
                proj_desc,
                pico_json,
                "Intracranial PAM angioarchitecture correlates with clinical hemorrhage and secondary aneurysms.",
                "What are the angioarchitectural characteristics and long-term stroke outcomes of cerebral PAM?",
                "active",
                1,
                0.70,
            )
        )
        print(f"    Project '{proj_name}' (ID: {project_id}) created.")

        # Seed Exclusion Reasons
        exclusion_reasons = [
            ("P_MISMATCH", "Non-intracranial or non-arterial vascular malformation", "population"),
            ("I_MISMATCH", "No radiological or surgical angioarchitecture detail", "intervention"),
            ("STUDY_DESIGN", "Letter to editor, conference abstract, or review without original imaging", "study_design"),
            ("LANGUAGE", "Non-English publication without translated full text", "language"),
            ("ANIMAL", "Animal or computational phantom study only", "population"),
        ]
        for code, label, category in exclusion_reasons:
            db.execute(
                """INSERT INTO exclusion_reasons (reason_id, project_id, code, label, category)
                   VALUES (?, ?, ?, ?, ?)""",
                (str(uuid.uuid4()), project_id, code, label, category)
            )

        # Seed Screening Keywords
        keywords = [
            ("pure arterial malformation", "inclusion", "title_abstract", 2.0),
            ("pure pial arterial malformation", "inclusion", "title_abstract", 2.0),
            ("coil-like arterial mass", "inclusion", "title_abstract", 1.5),
            ("arteriovenous malformation", "exclusion", "title_abstract", 1.0),
            ("dural arteriovenous fistula", "exclusion", "title_abstract", 1.0),
            ("cavernous malformation", "exclusion", "title_abstract", 1.0),
        ]
        for kw, kw_type, scope, weight in keywords:
            db.execute(
                """INSERT INTO screening_keywords (keyword_id, project_id, keyword, keyword_type, field_scope, weight)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (str(uuid.uuid4()), project_id, kw, kw_type, scope, weight)
            )

        # Seed Studies
        sample_studies = [
            (
                "study_albina_2024",
                project_id,
                "Endovascular Management of Distal Cerebral Pure Arterial Malformations: A Multicenter Cohort",
                "Albina P, Zhang L, Dubois M, et al.",
                2024,
                "Journal of NeuroInterventional Surgery",
                "10.1136/jnis-2024-001234",
                "38472910",
                (
                    "Background: Pure arterial malformations (PAM) are rare tortuous arterial coils lacking "
                    "a venous shunt component. Methods: We retrospectively analyzed 32 patients with angiographically "
                    "confirmed PAM treated between 2018 and 2023. Results: Aneurysms were identified along the PAM loops "
                    "in 46% of patients. Endovascular flow-diverting stents achieved complete loop remodeling in 88%."
                ),
                "PubMed",
                "cohort",
                "included",
            ),
            (
                "study_chua_2023",
                project_id,
                "Angioarchitectural Features and Rupture Risk of Pial Pure Arterial Malformations",
                "Chua C, Henderson K, Morales F",
                2023,
                "American Journal of Neuroradiology",
                "10.3174/ajnr.A7890",
                "37291823",
                (
                    "Pure pial arterial malformations present distinct high-resolution vessel wall MRI characteristics. "
                    "This study evaluated 19 adult patients undergoing 3T magnetic resonance angiography. Arterial ectasia "
                    "was most frequent in the middle cerebral artery M2-M3 branches."
                ),
                "PubMed",
                "cohort",
                "included",
            ),
            (
                "study_birua_2024",
                project_id,
                "Diagnostic Accuracy of 4D-Flow MRI vs Conventional Angiography for Pure Arterial Malformations",
                "Birua S, Kumar V, Tanaka H",
                2024,
                "Radiology",
                "10.1148/radiol.20240981",
                "38901234",
                (
                    "We prospectively evaluated 4D-flow phase contrast MRI against digital subtraction angiography (DSA) "
                    "in 42 suspected intracranial vascular lesions. 4D-flow correctly differentiated PAM from pial AV fistulas "
                    "with 96% sensitivity and 98% specificity by confirming the absence of early venous drainage."
                ),
                "PubMed",
                "diagnostic accuracy",
                "included",
            ),
            (
                "study_alhammami_2024",
                project_id,
                "Assessment of Diagnostic Accuracy of CT Compared to MRI in Detecting Metastases in Colorectal Cancer",
                "Qaed S Alhammami",
                2024,
                "Cureus",
                "10.7759/cureus.66125",
                "39229423",
                (
                    "This study compared diagnostic accuracy of CT and MRI in detecting metastases in 51 patients. "
                    "CT had a false negative rate of 7.8% and false positive rate of 7.8%. Diagnostic accuracy measures were compared."
                ),
                "PMC",
                "diagnostic accuracy",
                "excluded",
            ),
        ]

        for s_id, p_id, title, authors, year, journal, doi, pmid, abstract, source, design, status in sample_studies:
            db.execute(
                """INSERT INTO studies (
                    study_id, project_id, title, authors, publication_year, journal,
                    doi, pmid, abstract, source, study_design, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (s_id, p_id, title, authors, year, journal, doi, pmid, abstract, source, design, status)
            )

        # Seed Extraction Variables
        extraction_vars = [
            ("V1_PAM_location", "Anatomic Location", "categorical", "Q1 - Angioarchitecture", "cortical, subcortical, basal_ganglia, thalamus, brainstem, other, NR"),
            ("V2_Vascular_territory", "Vascular Territory", "categorical", "Q1 - Angioarchitecture", "anterior_circulation_MCA, anterior_circulation_ACA, posterior_circulation_PCA, other, NR"),
            ("V3_Aneurysm_present", "Associated Aneurysm", "boolean", "Q2 - Aneurysm & Rupture", "true, false, NR"),
            ("V4_Intervention_type", "Management Strategy", "categorical", "Q3 - Management", "endovascular, microsurgery, conservative, NR"),
            ("V5_Followup_months", "Follow-up Duration (months)", "numeric", "Q4 - Outcomes", ""),
        ]
        for v_name, v_label, v_type, v_sec, v_vals in extraction_vars:
            db.execute(
                """INSERT INTO variables (
                    variable_id, project_id, name, field_type, section, allowed_values, description, order_index
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (str(uuid.uuid4()), project_id, v_name, v_type, v_sec, v_vals, v_label, 1)
            )
        
        print(f"    Seeded {len(sample_studies)} studies, {len(keywords)} keywords, and {len(extraction_vars)} codebook variables.")
    else:
        print(f"[*] Database already contains {len(existing_projects)} project(s). Skipping sample data seed.")

    raw_conn.commit()
    db.close()
    
    print("\n" + "=" * 60)
    print("Database Initialized and Ready!")
    print(f"  Database file: {settings.db_path}")
    print(f"  Admin User:    {admin_username}")
    print(f"  Admin Pass:    {admin_password}")
    print(f"  Default Role:  owner")
    print(f"  CORS Origins:  {settings.cors_origins}")
    print("=" * 60)


if __name__ == "__main__":
    seed_database()
