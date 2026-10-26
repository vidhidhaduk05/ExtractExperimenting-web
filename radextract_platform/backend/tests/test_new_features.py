"""Tests for new features: expanded reference parsers, keyword groups, reference export, research question extraction."""
import pytest
import json
from services.reference_parser import (
    parse_csv, parse_pubmed_xml, parse_nbib, parse_endnote_xml, parse_ovid, parse_file,
)
from services.reference_export import export_ris, export_bibtex, export_endnote_xml
from services.search_string_generator import (
    generate_search_strings, extract_pico_from_question, _simple_pico_extraction,
    MESH_MAPPING, _get_synonyms,
)
from fastapi.testclient import TestClient
from main import app
from database import reset_db, init_db
from config import settings


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    """Use a temporary database for each test."""
    db_path = str(tmp_path / "test_api.db")
    monkeypatch.setattr(settings, "db_path", db_path)
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    reset_db()
    init_db()
    yield


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def project(client):
    """Create a project and return its ID."""
    r = client.post("/api/projects", json={"name": "Test Review", "description": "A test"})
    return r.json()["project_id"]


# ═══════════════════════════════════════════════════════════════════════
#  CSV Parser Tests
# ═══════════════════════════════════════════════════════════════════════

CSV_SCOPUS = """Title,Authors,Year,Source title,DOI,Abstract
"Diagnostic accuracy of MRI","Smith J.; Doe A.",2023,Radiology,10.1148/radiol.202323001,"MRI shows promise for detecting liver metastases."
"CT versus MRI","Chen W.",2022,European Radiology,10.1007/s00330-022-09001,"Comparison of CT and MRI for liver imaging."
"""

CSV_WOS = """Article Title,Author Full Name,Publication Year,Journal,DOI
"Meta-analysis of imaging modalities","Johnson, Robert",2021,AJR,10.2214/AJR.21.12345
"""

CSV_EMPTY = """Title,Authors,Year
"","",""
"""

CSV_NO_TITLE_COL = """Name,Authors,Year
"Some article","Smith J.",2023
"""


class TestParseCSV:
    def test_parse_scopus_csv(self):
        records = parse_csv(CSV_SCOPUS)
        assert len(records) == 2
        assert "Diagnostic accuracy of MRI" in records[0]["title"]
        assert "Smith" in records[0]["authors"]
        assert records[0]["publication_year"] == 2023
        assert records[0]["doi"] == "10.1148/radiol.202323001"
        assert records[0]["journal"] == "Radiology"

    def test_parse_wos_csv(self):
        records = parse_csv(CSV_WOS)
        assert len(records) == 1
        assert "Meta-analysis" in records[0]["title"]
        assert records[0]["publication_year"] == 2021

    def test_parse_empty_csv(self):
        records = parse_csv(CSV_EMPTY)
        assert records == []

    def test_parse_no_title_column(self):
        records = parse_csv(CSV_NO_TITLE_COL)
        # Should try to find a title-like column
        assert len(records) == 1

    def test_parse_empty_content(self):
        assert parse_csv("") == []

    def test_source_field(self):
        records = parse_csv(CSV_SCOPUS)
        assert records[0]["source"] == "CSV import"

    def test_doi_url_stripped(self):
        csv_with_url = 'Title,DOI\n"Test","https://doi.org/10.1234/test"'
        records = parse_csv(csv_with_url)
        assert records[0]["doi"] == "10.1234/test"


# ═══════════════════════════════════════════════════════════════════════
#  PubMed XML Parser Tests
# ═══════════════════════════════════════════════════════════════════════

PUBMED_XML = """<?xml version="1.0" encoding="UTF-8"?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID version="1">36789123</PMID>
      <Article>
        <ArticleTitle>Diagnostic accuracy of MRI for liver metastases</ArticleTitle>
        <Abstract>
          <AbstractText>Background: MRI shows promise for detecting liver metastases.</AbstractText>
        </Abstract>
        <AuthorList>
          <Author>
            <LastName>Smith</LastName>
            <ForeName>John</ForeName>
          </Author>
          <Author>
            <LastName>Doe</LastName>
            <ForeName>Alice</ForeName>
          </Author>
        </AuthorList>
        <Journal>
          <Title>Radiology</Title>
          <JournalIssue>
            <PubDate>
              <Year>2023</Year>
            </PubDate>
          </JournalIssue>
        </Journal>
        <ELocationID EIdType="doi">10.1148/radiol.202323001</ELocationID>
      </Article>
    </MedlineCitation>
  </PubmedArticle>
</PubmedArticleSet>
"""

PUBMED_XML_EMPTY = '<?xml version="1.0"?><PubmedArticleSet></PubmedArticleSet>'


class TestParsePubmedXML:
    def test_parse_single_article(self):
        records = parse_pubmed_xml(PUBMED_XML)
        assert len(records) == 1
        assert records[0]["title"] == "Diagnostic accuracy of MRI for liver metastases"
        assert "Smith" in records[0]["authors"]
        assert "Doe" in records[0]["authors"]
        assert records[0]["journal"] == "Radiology"
        assert records[0]["publication_year"] == 2023
        assert records[0]["doi"] == "10.1148/radiol.202323001"
        assert records[0]["pmid"] == "36789123"

    def test_parse_abstract(self):
        records = parse_pubmed_xml(PUBMED_XML)
        assert "MRI shows promise" in records[0]["abstract"]

    def test_parse_empty_xml(self):
        records = parse_pubmed_xml(PUBMED_XML_EMPTY)
        assert records == []

    def test_parse_invalid_xml(self):
        records = parse_pubmed_xml("not valid xml")
        assert records == []

    def test_parse_empty_content(self):
        assert parse_pubmed_xml("") == []

    def test_source_field(self):
        records = parse_pubmed_xml(PUBMED_XML)
        assert records[0]["source"] == "PubMed XML import"


# ═══════════════════════════════════════════════════════════════════════
#  NBIB Parser Tests
# ═══════════════════════════════════════════════════════════════════════

NBIB_SINGLE = """PMID- 36789123
TI  - Diagnostic accuracy of MRI for liver metastases
AU  - Smith John
AU  - Doe Alice
AB  - Background: MRI shows promise for detecting liver metastases.
DP  - 2023 Jan
JT  - Radiology
DOI - 10.1148/radiol.202323001
PT  - Journal Article
LA  - eng
"""

NBIB_MULTIPLE = """PMID- 36789123
TI  - First article title
AU  - Smith John
DP  - 2023
JT  - Radiology

PMID- 36789124
TI  - Second article title
AU  - Chen Wei
DP  - 2022
JT  - European Radiology
"""


class TestParseNBIB:
    def test_parse_single(self):
        records = parse_nbib(NBIB_SINGLE)
        assert len(records) == 1
        assert records[0]["title"] == "Diagnostic accuracy of MRI for liver metastases"
        assert "Smith" in records[0]["authors"]
        assert records[0]["publication_year"] == 2023
        assert records[0]["pmid"] == "36789123"
        assert records[0]["doi"] == "10.1148/radiol.202323001"

    def test_parse_multiple(self):
        records = parse_nbib(NBIB_MULTIPLE)
        assert len(records) == 2
        assert records[0]["title"] == "First article title"
        assert records[1]["title"] == "Second article title"

    def test_parse_empty(self):
        assert parse_nbib("") == []

    def test_source_field(self):
        records = parse_nbib(NBIB_SINGLE)
        assert records[0]["source"] == "NBIB import"


# ═══════════════════════════════════════════════════════════════════════
#  EndNote XML Parser Tests
# ═══════════════════════════════════════════════════════════════════════

ENDNOTE_XML = """<?xml version="1.0" encoding="UTF-8"?>
<records>
  <record>
    <title><style face="normal" font="default" size="100%">Diagnostic accuracy of MRI</style></title>
    <author><style face="normal" font="default" size="100%">Smith, John</style></author>
    <author><style face="normal" font="default" size="100%">Doe, Alice</style></author>
    <periodical><style face="italic" font="default" size="100%">Radiology</style></periodical>
    <year><style face="normal" font="default" size="100%">2023</style></year>
    <electronic-resource-num><style face="normal" font="default" size="100%">10.1148/radiol.202323001</style></electronic-resource-num>
    <abstract><style face="normal" font="default" size="100%">MRI shows promise for detecting liver metastases.</style></abstract>
  </record>
</records>
"""


class TestParseEndNoteXML:
    def test_parse_single(self):
        records = parse_endnote_xml(ENDNOTE_XML)
        assert len(records) == 1
        assert "Diagnostic accuracy of MRI" in records[0]["title"]
        assert "Smith" in records[0]["authors"]
        assert "Doe" in records[0]["authors"]
        assert records[0]["journal"] == "Radiology"
        assert records[0]["publication_year"] == 2023
        assert records[0]["doi"] == "10.1148/radiol.202323001"

    def test_parse_empty(self):
        assert parse_endnote_xml("") == []

    def test_parse_invalid(self):
        assert parse_endnote_xml("not xml") == []

    def test_source_field(self):
        records = parse_endnote_xml(ENDNOTE_XML)
        assert records[0]["source"] == "EndNote XML import"


# ═══════════════════════════════════════════════════════════════════════
#  OVID Parser Tests
# ═══════════════════════════════════════════════════════════════════════

OVID_SINGLE = """1. Author
   Smith John; Doe Alice
2. Title
   Diagnostic accuracy of MRI for liver metastases
3. Source
   Radiology. 2023 Jan; 287(1): 123-130.
5. DOI
   10.1148/radiol.202323001
6. Abstract
   Background: MRI shows promise for detecting liver metastases.
"""

OVID_MULTIPLE = """1. Author
   Smith John
2. Title
   First article
3. Source
   Radiology. 2023; 287(1): 123-130.

1. Author
   Chen Wei
2. Title
   Second article
3. Source
   European Radiology. 2022; 32(5): 3456-3460.
"""


class TestParseOVID:
    def test_parse_single(self):
        records = parse_ovid(OVID_SINGLE)
        assert len(records) == 1
        assert "Diagnostic accuracy" in records[0]["title"]
        assert "Smith" in records[0]["authors"]
        assert records[0]["publication_year"] == 2023
        assert records[0]["doi"] == "10.1148/radiol.202323001"

    def test_parse_multiple(self):
        records = parse_ovid(OVID_MULTIPLE)
        assert len(records) == 2
        assert "First article" in records[0]["title"]
        assert "Second article" in records[1]["title"]

    def test_parse_empty(self):
        assert parse_ovid("") == []

    def test_source_field(self):
        records = parse_ovid(OVID_SINGLE)
        assert records[0]["source"] == "OVID import"


# ═══════════════════════════════════════════════════════════════════════
#  Parse File Auto-Detection Tests
# ═══════════════════════════════════════════════════════════════════════

class TestParseFileDetection:
    def test_detect_csv_by_extension(self):
        records = parse_file(CSV_SCOPUS, "export.csv")
        assert len(records) == 2

    def test_detect_pubmed_xml_by_extension(self):
        records = parse_file(PUBMED_XML, "pubmed.xml")
        assert len(records) == 1

    def test_detect_nbib_by_extension(self):
        records = parse_file(NBIB_SINGLE, "pubmed.nbib")
        assert len(records) == 1

    def test_detect_endnote_xml_by_extension(self):
        records = parse_file(ENDNOTE_XML, "endnote.xml")
        assert len(records) == 1

    def test_detect_ovid_by_extension(self):
        records = parse_file(OVID_SINGLE, "ovid.txt")
        assert len(records) == 1

    def test_detect_pubmed_xml_by_content(self):
        records = parse_file(PUBMED_XML, "unknown.txt")
        assert len(records) == 1


# ═══════════════════════════════════════════════════════════════════════
#  Expanded Search String Tests
# ═══════════════════════════════════════════════════════════════════════

class TestExpandedSearchStrings:
    def test_cardiology_terms(self):
        """Heart failure should produce MeSH terms."""
        pico = {
            "population": "patients with heart failure",
            "index_test": "echocardiography",
            "comparator": "",
            "outcome": "mortality",
            "study_design": "",
        }
        result = generate_search_strings(pico)
        assert result["pubmed"]
        assert "[MeSH Terms]" in result["pubmed"]
        assert "heart failure" in result["pubmed"].lower()

    def test_neurology_terms(self):
        """Alzheimer's disease should produce MeSH terms."""
        pico = {
            "population": "patients with alzheimer's disease",
            "index_test": "MRI",
            "comparator": "CT",
            "outcome": "diagnostic accuracy",
            "study_design": "",
        }
        result = generate_search_strings(pico)
        assert result["pubmed"]
        assert "[MeSH Terms]" in result["pubmed"]

    def test_diabetes_terms(self):
        """Type 2 diabetes should produce MeSH terms."""
        pico = {
            "population": "patients with type 2 diabetes",
            "index_test": "metformin",
            "comparator": "placebo",
            "outcome": "mortality",
            "study_design": "randomized controlled trial",
        }
        result = generate_search_strings(pico)
        assert result["pubmed"]
        assert "[MeSH Terms]" in result["pubmed"]

    def test_mental_health_terms(self):
        """Depression should produce MeSH terms."""
        pico = {
            "population": "patients with depression",
            "index_test": "cognitive behavioral therapy",
            "comparator": "",
            "outcome": "quality of life",
            "study_design": "",
        }
        result = generate_search_strings(pico)
        assert result["pubmed"]
        assert "[MeSH Terms]" in result["pubmed"]

    def test_intervention_alias(self):
        """`intervention` should work as alias for `index_test`."""
        pico = {
            "population": "patients with colorectal cancer",
            "intervention": "MRI",  # using alias instead of index_test
            "comparator": "",
            "outcome": "diagnostic accuracy",
            "study_design": "",
        }
        result = generate_search_strings(pico)
        assert result["pubmed"]
        assert "magnetic resonance imaging" in result["pubmed"].lower()

    def test_synonym_expansion(self):
        """Synonyms should be added for known terms."""
        synonyms = _get_synonyms("heart failure")
        assert "cardiac failure" in synonyms or "ventricular dysfunction" in synonyms

    def test_mesh_mapping_has_general_medicine(self):
        """Verify expanded mapping includes non-radiology terms."""
        assert "heart failure" in MESH_MAPPING
        assert "diabetes" in MESH_MAPPING
        assert "depression" in MESH_MAPPING
        assert "asthma" in MESH_MAPPING
        assert "stroke" in MESH_MAPPING

    def test_word_boundary_matching(self):
        """Short keys should not match inside longer words."""
        from services.search_string_generator import _lookup_term
        # "uti" is a key but should not match inside "computing"
        assert _lookup_term("quantum computing device") is None


# ═══════════════════════════════════════════════════════════════════════
#  Research Question Extraction Tests
# ═══════════════════════════════════════════════════════════════════════

class TestResearchQuestionExtraction:
    @pytest.fixture(autouse=True)
    def mock_search_model(self, monkeypatch):
        # These tests exercise PICO extraction, not a live model connection.
        monkeypatch.setattr("services.tool_calling_client.ToolCallingClient.call_with_tool", lambda *args, **kwargs: {})
        monkeypatch.setattr(
            "services.search_string_generator.generate_ai_search_strings",
            lambda pico, research_question="": generate_search_strings(pico),
        )

    def test_simple_extraction_population(self):
        """Simple extraction should find population from 'in patients with X'."""
        pico = _simple_pico_extraction(
            "Is MRI better than CT for detecting liver metastases in patients with colorectal cancer?"
        )
        assert "colorectal cancer" in pico["population"].lower()

    def test_simple_extraction_index_test_comparator(self):
        """Simple extraction should find index test and comparator from 'X better than Y'."""
        pico = _simple_pico_extraction(
            "Is MRI better than CT for detecting liver metastases in patients with colorectal cancer?"
        )
        assert "mri" in pico["index_test"].lower()
        assert "ct" in pico["comparator"].lower()

    def test_simple_extraction_outcome(self):
        """Simple extraction should find outcome from 'detecting X'."""
        pico = _simple_pico_extraction(
            "Is MRI better than CT for detecting liver metastases in patients with colorectal cancer?"
        )
        assert "liver metastases" in pico["outcome"].lower()

    def test_extract_pico_from_question_returns_pico_and_strings(self):
        """Full extraction should return both pico and strings."""
        result = extract_pico_from_question(
            "Is MRI better than CT for detecting liver metastases in patients with colorectal cancer?"
        )
        assert "pico" in result
        assert "strings" in result
        assert isinstance(result["pico"], dict)
        assert isinstance(result["strings"], dict)
        # Should have all 6 databases
        assert set(result["strings"].keys()) == {
            "pubmed", "embase", "cochrane", "web_of_science", "scopus", "cinahl"
        }

    def test_extract_pico_from_empty_question(self):
        """Empty question should still return structure."""
        result = extract_pico_from_question("")
        assert "pico" in result
        assert "strings" in result


# ═══════════════════════════════════════════════════════════════════════
#  Reference Export Tests
# ═══════════════════════════════════════════════════════════════════════

EXPORT_STUDIES = [
    {
        "title": "Diagnostic accuracy of MRI",
        "authors": "Smith John, Doe Alice",
        "journal": "Radiology",
        "publication_year": 2023,
        "doi": "10.1148/radiol.202323001",
        "pmid": "36789123",
        "abstract": "MRI shows promise.",
    },
    {
        "title": "CT versus MRI",
        "authors": "Chen Wei",
        "journal": "European Radiology",
        "publication_year": 2022,
        "doi": "10.1007/s00330-022-09001",
        "pmid": "",
        "abstract": "",
    },
]


class TestExportRIS:
    def test_export_has_records(self):
        result = export_ris(EXPORT_STUDIES)
        assert "TY  - JOUR" in result
        assert "ER  - " in result
        assert result.count("TY  - JOUR") == 2

    def test_export_has_title(self):
        result = export_ris(EXPORT_STUDIES)
        assert "Diagnostic accuracy of MRI" in result

    def test_export_has_authors(self):
        result = export_ris(EXPORT_STUDIES)
        assert "Smith John" in result
        assert "Doe Alice" in result

    def test_export_has_doi(self):
        result = export_ris(EXPORT_STUDIES)
        assert "10.1148/radiol.202323001" in result

    def test_export_has_pmid(self):
        result = export_ris(EXPORT_STUDIES)
        assert "36789123" in result

    def test_export_empty(self):
        assert export_ris([]) == ""


class TestExportBibtex:
    def test_export_has_entries(self):
        result = export_bibtex(EXPORT_STUDIES)
        assert "@article{" in result
        assert result.count("@article{") == 2

    def test_export_has_title(self):
        result = export_bibtex(EXPORT_STUDIES)
        assert "Diagnostic accuracy of MRI" in result

    def test_export_has_year(self):
        result = export_bibtex(EXPORT_STUDIES)
        assert "year = {2023}" in result

    def test_export_has_doi(self):
        result = export_bibtex(EXPORT_STUDIES)
        assert "10.1148/radiol.202323001" in result

    def test_export_empty(self):
        assert export_bibtex([]) == ""


class TestExportEndNoteXML:
    def test_export_has_records(self):
        result = export_endnote_xml(EXPORT_STUDIES)
        assert "<records>" in result
        assert "</records>" in result
        assert result.count("<record>") == 2

    def test_export_has_title(self):
        result = export_endnote_xml(EXPORT_STUDIES)
        assert "Diagnostic accuracy of MRI" in result

    def test_export_has_xml_declaration(self):
        result = export_endnote_xml(EXPORT_STUDIES)
        assert result.startswith('<?xml version="1.0"')

    def test_export_escapes_html(self):
        studies = [{"title": "Test <script>", "authors": "", "journal": "", "publication_year": 2023}]
        result = export_endnote_xml(studies)
        assert "&lt;script&gt;" in result
        assert "<script>" not in result

    def test_export_empty(self):
        result = export_endnote_xml([])
        assert "<records>" in result
        assert result.count("<record>") == 0


# ═══════════════════════════════════════════════════════════════════════
#  Keyword Groups API Tests
# ═══════════════════════════════════════════════════════════════════════

class TestKeywordGroupsAPI:
    def test_create_keyword_group(self, client, project):
        r = client.post(
            f"/api/projects/{project}/keyword-groups",
            json={"name": "Inclusion Keywords", "color": "#ff0000", "keywords": ["cancer", "metastasis"]},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "Inclusion Keywords"
        assert data["color"] == "#ff0000"
        assert "cancer" in data["keywords"]
        assert data["group_id"]

    def test_list_keyword_groups(self, client, project):
        # Create one first
        client.post(
            f"/api/projects/{project}/keyword-groups",
            json={"name": "Test Group", "color": "#00ff00", "keywords": ["test"]},
        )
        r = client.get(f"/api/projects/{project}/keyword-groups")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        assert data[0]["name"] == "Test Group"

    def test_update_keyword_group(self, client, project):
        # Create
        r = client.post(
            f"/api/projects/{project}/keyword-groups",
            json={"name": "Original", "color": "#000000", "keywords": ["a"]},
        )
        group_id = r.json()["group_id"]

        # Update
        r = client.put(
            f"/api/projects/{project}/keyword-groups/{group_id}",
            json={"name": "Updated", "keywords": ["a", "b", "c"]},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "Updated"
        assert len(data["keywords"]) == 3

    def test_delete_keyword_group(self, client, project):
        # Create
        r = client.post(
            f"/api/projects/{project}/keyword-groups",
            json={"name": "To Delete", "color": "#123456", "keywords": []},
        )
        group_id = r.json()["group_id"]

        # Delete
        r = client.delete(f"/api/projects/{project}/keyword-groups/{group_id}")
        assert r.status_code == 200

        # Verify it's gone
        r = client.get(f"/api/projects/{project}/keyword-groups")
        group_ids = [g["group_id"] for g in r.json()]
        assert group_id not in group_ids

    def test_keyword_group_project_not_found(self, client):
        r = client.post(
            "/api/projects/nonexistent/keyword-groups",
            json={"name": "Test", "color": "#fff", "keywords": []},
        )
        assert r.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
#  Reference Export API Tests
# ═══════════════════════════════════════════════════════════════════════

class TestReferenceExportAPI:
    def test_export_ris(self, client, project):
        # Add a study first
        client.post(
            f"/api/projects/{project}/studies",
            json={"project_id": project, "title": "Test Study", "authors": "Test Author", "publication_year": 2023},
        )
        r = client.get(f"/api/projects/{project}/export/references?format=ris&status=all")
        assert r.status_code == 200
        assert "TY  - JOUR" in r.text

    def test_export_bibtex(self, client, project):
        client.post(
            f"/api/projects/{project}/studies",
            json={"project_id": project, "title": "BibTeX Test", "authors": "Author", "publication_year": 2023},
        )
        r = client.get(f"/api/projects/{project}/export/references?format=bibtex&status=all")
        assert r.status_code == 200
        assert "@article{" in r.text

    def test_export_endnote(self, client, project):
        client.post(
            f"/api/projects/{project}/studies",
            json={"project_id": project, "title": "EndNote Test", "authors": "Author", "publication_year": 2023},
        )
        r = client.get(f"/api/projects/{project}/export/references?format=endnote&status=all")
        assert r.status_code == 200
        assert "<records>" in r.text

    def test_export_no_studies(self, client, project):
        r = client.get(f"/api/projects/{project}/export/references?format=ris&status=included")
        assert r.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
#  Research Question API Tests
# ═══════════════════════════════════════════════════════════════════════

class TestResearchQuestionAPI:
    def test_search_from_question(self, client, project, monkeypatch):
        pico = {"population": "colorectal cancer", "index_test": "MRI"}
        strings = generate_search_strings(pico) | {
            "ovid_medline": "MRI.ti,ab.", "ovid_embase": "MRI.ti,ab.",
        }
        monkeypatch.setattr(
            "services.tool_calling_client.ToolCallingClient.call_with_tool",
            lambda self, tool_name, **kwargs: pico if tool_name == "extract_pico" else {"strings": strings},
        )
        r = client.post(
            f"/api/projects/{project}/search-from-question",
            json={"question": "Is MRI better than CT for detecting liver metastases in patients with colorectal cancer?"},
        )
        assert r.status_code == 200
        data = r.json()
        assert "pico" in data
        assert "strings" in data
        assert "pubmed" in data["strings"]

    def test_search_from_empty_question(self, client, project):
        r = client.post(
            f"/api/projects/{project}/search-from-question",
            json={"question": ""},
        )
        assert r.status_code == 400

    def test_search_from_question_project_not_found(self, client):
        r = client.post(
            "/api/projects/nonexistent/search-from-question",
            json={"question": "test question"},
        )
        assert r.status_code == 404

    def test_pico_from_question_success(self, client, project, monkeypatch):
        r = client.post(
            f"/api/projects/{project}/pico/from-question",
            json={"question": "Is MRI better than CT for detecting liver metastases in patients with colorectal cancer?", "persist": True},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["project_id"] == project
        assert "pico" in data
        assert "mri" in data["pico"]["index_test"].lower()
        assert "ct" in data["pico"]["comparator"].lower()
        assert "ambiguities" in data
        assert "missing_fields" in data

    def test_pico_from_empty_question(self, client, project):
        r = client.post(
            f"/api/projects/{project}/pico/from-question",
            json={"question": ""},
        )
        assert r.status_code == 400
