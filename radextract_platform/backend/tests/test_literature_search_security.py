"""Security unit tests for literature search router (radextract_platform/backend/routers/literature_search.py)."""
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_search_literature_empty_query():
    """Whitespace or empty queries should return 422 (validation) or 400 Bad Request."""
    res_empty = client.post("/api/search/multi-database", json={"query": ""})
    assert res_empty.status_code in (400, 422)

    res_spaces = client.post("/api/search/multi-database", json={"query": "   "})
    assert res_spaces.status_code == 400
    assert "cannot be empty" in res_spaces.json()["detail"].lower()


def test_search_literature_excessive_length():
    """Queries exceeding max_length should be rejected with 422 Unprocessable Entity."""
    long_query = "a" * 1001
    res = client.post("/api/search/multi-database", json={"query": long_query})
    assert res.status_code == 422


@patch("routers.literature_search.search_multi_database")
def test_search_literature_internal_error_does_not_leak_stack(mock_search):
    """Internal exception details must not be leaked in the HTTP response body."""
    mock_search.side_effect = RuntimeError("Sensitive DB Connection String or Internal Stack Trace")

    res = client.post("/api/search/multi-database", json={"query": "radiology CT"})
    assert res.status_code == 500
    detail = res.json()["detail"]
    assert "Sensitive" not in detail
    assert "Stack Trace" not in detail
    assert "An error occurred while executing the literature search." in detail


@patch("routers.literature_search.search_multi_database")
def test_search_literature_success(mock_search):
    """Valid queries should call search_multi_database and return success result."""
    mock_search.return_value = {
        "results": [{"title": "CT vs MRI in Stroke", "doi": "10.1000/182"}],
        "total": 1,
    }

    res = client.post("/api/search/multi-database", json={"query": "stroke MRI", "sources": ["pubmed"], "max_per_source": 10})
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["total"] == 1
    assert data["results"][0]["title"] == "CT vs MRI in Stroke"
    mock_search.assert_called_once_with(
        query="stroke MRI",
        sources=["pubmed"],
        max_per_source=10,
    )
