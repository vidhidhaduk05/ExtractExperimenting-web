import sqlite3
import uuid

def seed():
    conn = sqlite3.connect('radextract_dev.db')
    c = conn.cursor()

    proj_id = 'pam_review_2026'
    c.execute("DELETE FROM projects WHERE project_id = ?", (proj_id,))
    c.execute("""
        INSERT INTO projects (project_id, name, description, research_question)
        VALUES (?, ?, ?, ?)
    """, (
        proj_id,
        "Pure Arterial Malformations (PAM) Systematic Review",
        "A multicenter systematic review of anatomical and clinical outcomes in intracranial pure arterial malformations.",
        "What are the morphological and clinical treatment outcomes of intracranial PAM?"
    ))

    # Variables in the exact user-specified order: Study ID | Year | Author | Country | Sample size
    variables = [
        ('var_study_id', proj_id, 'General', 'Study ID', 'text', 0, 'Unique study identifier label (e.g. Birua 2022)'),
        ('var_year', proj_id, 'Bibliographic', 'Year', 'number', 1, 'Year of publication'),
        ('var_author', proj_id, 'Bibliographic', 'Author', 'text', 2, 'First author surname'),
        ('var_country', proj_id, 'Demographics', 'Country', 'text', 3, 'Country where study was conducted'),
        ('var_sample_size', proj_id, 'Clinical', 'Sample size', 'number', 4, 'Total number of confirmed PAM patients'),
    ]

    c.execute("DELETE FROM variables WHERE project_id = ?", (proj_id,))
    for v in variables:
        c.execute("""
            INSERT INTO variables (variable_id, project_id, section, name, field_type, order_index, description)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, v)

    # Studies
    studies = [
        ('study_birua_2022', proj_id, 'Pure arterial malformation of the posterior cerebral artery: A case report', 'Birua et al.', 2022, 'Birua 2022', 'Birua_2022.pdf'),
        ('study_albina_2024', proj_id, 'A Hybrid Approach for the Treatment of a Pure Arterial Malformation Located at an Accessory Middle Cerebral Artery', 'Albina-Palmarola et al.', 2024, 'Albina 2024', 'Albina-Palmarola_2024.pdf'),
        ('study_brinjikji_2018', proj_id, 'Pure arterial malformations: a systematic review of clinical characteristics and treatment outcomes', 'Brinjikji et al.', 2018, 'Brinjikji 2018', 'Brinjikji_2018.pdf'),
        ('study_deshmukh_2023', proj_id, 'Pure Arterial Malformation (PAM) Case Report and Review of Literature', 'Deshmukh et al.', 2023, 'Deshmukh 2023', 'Deshmukh_2023.pdf'),
    ]

    c.execute("DELETE FROM studies WHERE project_id = ?", (proj_id,))
    for s in studies:
        c.execute("""
            INSERT INTO studies (study_id, project_id, title, authors, publication_year, study_label, pdf_path, screening_status, extraction_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'included', 'in_progress')
        """, s)

    # Sample extractions
    extractions = [
        # Birua
        (str(uuid.uuid4()), 'study_birua_2022', 'var_study_id', 'Birua 2022', 0.98, 1, 'dysplastic right cavernous and clinoidal segments of internal carotid artery (ICA) along with tortuous, redundant vascular compact loops of purely arterial mass (PAM) of left posterior cerebral artery (PCA) were evident', 'verified'),
        (str(uuid.uuid4()), 'study_birua_2022', 'var_year', '2022', 0.99, 1, 'Published online: 2022', 'verified'),
        (str(uuid.uuid4()), 'study_birua_2022', 'var_author', 'Birua', 0.95, 1, 'Birua CA, Department of Neurosurgery', 'verified'),
        (str(uuid.uuid4()), 'study_birua_2022', 'var_country', 'India', 0.90, 1, 'All India Institute of Medical Sciences, New Delhi, India', 'pending'),
        (str(uuid.uuid4()), 'study_birua_2022', 'var_sample_size', '1', 0.92, 1, 'A 45-year-old female presented with sudden-onset headache', 'pending'),
        # Albina
        (str(uuid.uuid4()), 'study_albina_2024', 'var_study_id', 'Albina 2024', 0.98, 1, 'Albina-Palmarola N, et al.', 'verified'),
        (str(uuid.uuid4()), 'study_albina_2024', 'var_year', '2024', 0.99, 1, 'World Neurosurgery 2024', 'verified'),
        (str(uuid.uuid4()), 'study_albina_2024', 'var_author', 'Albina-Palmarola', 0.96, 1, 'Albina-Palmarola N', 'verified'),
        (str(uuid.uuid4()), 'study_albina_2024', 'var_country', 'Spain', 0.88, 1, 'Hospital Clinic de Barcelona, Spain', 'pending'),
        (str(uuid.uuid4()), 'study_albina_2024', 'var_sample_size', '1', 0.94, 1, 'A 54-year-old woman presented with acute severe headache', 'pending'),
        # Brinjikji
        (str(uuid.uuid4()), 'study_brinjikji_2018', 'var_study_id', 'Brinjikji 2018', 0.99, 1, 'pure arterial malformations', 'verified'),
        (str(uuid.uuid4()), 'study_brinjikji_2018', 'var_year', '2018', 0.99, 1, 'J Neurosurg 129:91–99, 2018', 'verified'),
        (str(uuid.uuid4()), 'study_brinjikji_2018', 'var_author', 'Brinjikji', 0.98, 2, 'W. Brinjikji et al.', 'verified'),
        (str(uuid.uuid4()), 'study_brinjikji_2018', 'var_country', 'USA', 0.91, 2, 'Mayo Clinic, Rochester, Minnesota', 'verified'),
        (str(uuid.uuid4()), 'study_brinjikji_2018', 'var_sample_size', '24', 0.89, 2, 'Only cases that met this definition as agreed upon by the study’s authors were included.', 'pending'),
        # Deshmukh
        (str(uuid.uuid4()), 'study_deshmukh_2023', 'var_study_id', 'Deshmukh 2023', 0.97, 1, 'Pure Arterial Malformation (PAM) Case Report and Review of Literature', 'verified'),
        (str(uuid.uuid4()), 'study_deshmukh_2023', 'var_year', '2023', 0.99, 1, 'Surg Neurol Int 2023', 'verified'),
        (str(uuid.uuid4()), 'study_deshmukh_2023', 'var_author', 'Deshmukh', 0.96, 1, 'Deshmukh S', 'verified'),
        (str(uuid.uuid4()), 'study_deshmukh_2023', 'var_country', 'USA', 0.93, 1, 'George Washington University Hospital, Washington, DC, USA', 'pending'),
        (str(uuid.uuid4()), 'study_deshmukh_2023', 'var_sample_size', '1', 0.95, 1, 'A 56-year-old male with a history of hypertension', 'pending'),
    ]

    c.execute("DELETE FROM extractions WHERE study_id IN ('study_birua_2022', 'study_albina_2024', 'study_brinjikji_2018', 'study_deshmukh_2023')")
    for e in extractions:
        c.execute("""
            INSERT INTO extractions (extraction_id, study_id, variable_id, value, confidence, source_page, source_text, verification_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, e)

    conn.commit()
    conn.close()
    print("Successfully seeded isolated radextract_dev.db with project pam_review_2026!")

if __name__ == "__main__":
    seed()
