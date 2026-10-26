import sqlite3
import uuid
from pathlib import Path

DB_PATH = Path(r"d:\Desktop\Rad Extract Experimenting\radextract_platform\backend\radextract.db")
conn = sqlite3.connect(DB_PATH)
c = conn.cursor()

proj_id = "pam_review_2026"
c.execute("DELETE FROM projects WHERE project_id = ?", (proj_id,))
c.execute("""
    INSERT INTO projects (project_id, name, description, research_question, hypothesis, pico_json)
    VALUES (?, ?, ?, ?, ?, ?)
""", (
    proj_id,
    "Pure Arterial Malformations (PAM) Systematic Review",
    "A multicenter systematic review of anatomical and clinical outcomes in intracranial pure arterial malformations.",
    "What are the morphological and clinical treatment outcomes of intracranial PAM?",
    "Pure arterial malformations represent non-shunting developmental vascular anomalies with high lifetime propensity for flow pseudoaneurysms (~40%).",
    '{"population":"patients with pure arterial malformations","index_test":"digital subtraction angiography","comparator":"MRA / CTA","outcome":"pseudoaneurysm formation, stroke, hemorrhage","study_design":"cohort, case series"}'
))

variables = [
    ("pam_var_study_id", proj_id, "General", "Study ID", "text", 0, "Unique study identifier label (e.g. Birua 2022)"),
    ("pam_var_year", proj_id, "Bibliographic", "Year", "number", 1, "Year of publication"),
    ("pam_var_author", proj_id, "Bibliographic", "Author", "text", 2, "First author surname"),
    ("pam_var_country", proj_id, "Demographics", "Country", "text", 3, "Country where study was conducted"),
    ("pam_var_sample_size", proj_id, "Clinical", "Sample size", "number", 4, "Total number of confirmed PAM patients"),
    ("pam_var_aneurysm_rate", proj_id, "Outcomes", "Aneurysm Rate (%)", "number", 5, "Percentage of patients presenting with associated aneurysm"),
    ("pam_var_management", proj_id, "Clinical", "Primary Management", "text", 6, "Conservative observation vs endovascular/surgical treatment"),
]

c.execute("DELETE FROM variables WHERE project_id = ?", (proj_id,))
for v in variables:
    c.execute("""
        INSERT OR REPLACE INTO variables (variable_id, project_id, section, name, field_type, order_index, description)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, v)

studies = [
    ("study_birua_2022", proj_id, "Pure arterial malformation of the posterior cerebral artery: A case report", "Birua et al.", 2022, "Birua 2022", "Birua_2022.pdf", "included", "complete"),
    ("study_albina_2024", proj_id, "A Hybrid Approach for the Treatment of a Pure Arterial Malformation Located at an Accessory Middle Cerebral Artery", "Albina-Palmarola et al.", 2024, "Albina 2024", "Albina-Palmarola_2024.pdf", "included", "complete"),
    ("study_brinjikji_2018", proj_id, "Pure arterial malformations: a systematic review of clinical characteristics and treatment outcomes", "Brinjikji et al.", 2018, "Brinjikji 2018", "Brinjikji_2018.pdf", "included", "complete"),
    ("study_deshmukh_2023", proj_id, "Pure Arterial Malformation (PAM) Case Report and Review of Literature", "Deshmukh et al.", 2023, "Deshmukh 2023", "Deshmukh_2023.pdf", "included", "in_progress"),
]

c.execute("DELETE FROM studies WHERE project_id = ?", (proj_id,))
for s in studies:
    c.execute("""
        INSERT OR REPLACE INTO studies (study_id, project_id, title, authors, publication_year, study_label, pdf_path, screening_status, extraction_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, s)

extractions = [
    (str(uuid.uuid4()), "study_birua_2022", "pam_var_study_id", "Birua 2022", 0.98, 1, "dysplastic right cavernous and clinoidal segments of internal carotid artery (ICA) along with tortuous, redundant vascular compact loops of purely arterial mass (PAM)", "verified"),
    (str(uuid.uuid4()), "study_birua_2022", "pam_var_year", "2022", 0.99, 1, "Published online: 2022", "verified"),
    (str(uuid.uuid4()), "study_birua_2022", "pam_var_author", "Birua", 0.95, 1, "Birua CA, Department of Neurosurgery", "verified"),
    (str(uuid.uuid4()), "study_birua_2022", "pam_var_country", "India", 0.90, 1, "All India Institute of Medical Sciences, New Delhi, India", "verified"),
    (str(uuid.uuid4()), "study_birua_2022", "pam_var_sample_size", "1", 0.92, 1, "A 45-year-old female presented with sudden-onset headache", "verified"),
    (str(uuid.uuid4()), "study_birua_2022", "pam_var_aneurysm_rate", "100", 0.88, 1, "coexisting dissecting aneurysm of the proximal segment", "verified"),
    (str(uuid.uuid4()), "study_birua_2022", "pam_var_management", "Conservative", 0.95, 1, "managed conservatively with serial MR angiographic surveillance", "verified"),

    (str(uuid.uuid4()), "study_albina_2024", "pam_var_study_id", "Albina 2024", 0.98, 1, "Albina-Palmarola N, et al.", "verified"),
    (str(uuid.uuid4()), "study_albina_2024", "pam_var_year", "2024", 0.99, 1, "World Neurosurgery, 2024", "verified"),
    (str(uuid.uuid4()), "study_albina_2024", "pam_var_author", "Albina-Palmarola", 0.95, 1, "Albina-Palmarola N", "verified"),
    (str(uuid.uuid4()), "study_albina_2024", "pam_var_country", "Spain", 0.92, 1, "Hospital Clinic de Barcelona, Barcelona, Spain", "verified"),
    (str(uuid.uuid4()), "study_albina_2024", "pam_var_sample_size", "1", 0.95, 1, "A 52-year-old male was admitted with acute ischemic symptoms", "verified"),
    (str(uuid.uuid4()), "study_albina_2024", "pam_var_aneurysm_rate", "0", 0.90, 1, "No associated aneurysms were visualized on 3D-rotational angiography", "verified"),
    (str(uuid.uuid4()), "study_albina_2024", "pam_var_management", "Hybrid flow diverter", 0.94, 1, "successful deployment of a low-profile visualized intraluminal support device", "verified"),

    (str(uuid.uuid4()), "study_brinjikji_2018", "pam_var_study_id", "Brinjikji 2018", 0.98, 1, "Brinjikji W, et al.", "verified"),
    (str(uuid.uuid4()), "study_brinjikji_2018", "pam_var_year", "2018", 0.99, 1, "Journal of NeuroInterventional Surgery 2018", "verified"),
    (str(uuid.uuid4()), "study_brinjikji_2018", "pam_var_author", "Brinjikji", 0.96, 1, "Brinjikji W, Department of Radiology, Mayo Clinic", "verified"),
    (str(uuid.uuid4()), "study_brinjikji_2018", "pam_var_country", "USA", 0.95, 1, "Mayo Clinic, Rochester, Minnesota, USA", "verified"),
    (str(uuid.uuid4()), "study_brinjikji_2018", "pam_var_sample_size", "28", 0.97, 1, "We identified 28 individual cases of PAM across international centers", "verified"),
    (str(uuid.uuid4()), "study_brinjikji_2018", "pam_var_aneurysm_rate", "42.8", 0.94, 1, "Associated aneurysms were reported in 12 of 28 patients (42.8%)", "verified"),
    (str(uuid.uuid4()), "study_brinjikji_2018", "pam_var_management", "Observation (65%)", 0.91, 1, "The majority of unruptured cases (18/28) were managed with clinical observation alone", "verified"),
]

c.execute("DELETE FROM extractions WHERE study_id IN (SELECT study_id FROM studies WHERE project_id = ?)", (proj_id,))
for ext in extractions:
    # ext has: (id, study_id, var_id, val, conf, page, text, status)
    c.execute("""
        INSERT INTO extractions (extraction_id, study_id, variable_id, value, confidence, source_page, source_text, verification_status, is_edited)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    """, ext)

conn.commit()
conn.close()
print("SUCCESS: pam_review_2026 successfully seeded into radextract.db!")
