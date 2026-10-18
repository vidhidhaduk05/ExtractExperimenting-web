"""Tests for the Docling → pdfplumber fallback (radextract_core.radextract.document_processor).

The real bug this guards against: DoclingProcessor.available only checks that ``import
docling`` succeeds. It does NOT catch a failure inside Docling's own pipeline (seen in
practice: RapidOCR's model fails to load under an older onnxruntime, raising on every
single conversion). Before this fix, that exception propagated out of process_pdf() and
failed the request instead of falling back to pdfplumber.
"""
import pytest

from radextract_core.radextract import document_processor as dp


class _FakeDoc:
    parsed = {"full_text": "fallback text", "pages": [], "tables": [], "figures": [],
              "triage": "OK", "n_pages": 1, "n_text_pages": 1}


def _fake_processed(engine):
    return dp.ProcessedDocument(doc_id="d1", parsed=_FakeDoc.parsed, metadata={"engine": engine})


def test_falls_back_when_docling_available_but_convert_raises(monkeypatch):
    """Mirrors the real bug: import succeeds, but .convert() blows up (e.g. OCR model load)."""
    monkeypatch.setattr(dp.DoclingProcessor, "available", property(lambda self: True))
    monkeypatch.setattr(
        dp.DoclingProcessor, "convert",
        lambda self, pdf_path, doc_id=None: (_ for _ in ()).throw(
            RuntimeError("Unsupported model IR version: 10, max supported IR version: 9")
        ),
    )
    monkeypatch.setattr(dp.FallbackProcessor, "convert", lambda self, pdf_path, doc_id=None: _fake_processed("pdfplumber"))

    result = dp.convert_with_fallback("some.pdf", doc_id="s1")
    assert result.metadata["engine"] == "pdfplumber"


def test_uses_docling_when_it_actually_works(monkeypatch):
    monkeypatch.setattr(dp.DoclingProcessor, "available", property(lambda self: True))
    monkeypatch.setattr(dp.DoclingProcessor, "convert", lambda self, pdf_path, doc_id=None: _fake_processed("docling"))
    monkeypatch.setattr(
        dp.FallbackProcessor, "convert",
        lambda self, pdf_path, doc_id=None: pytest.fail("must not fall back when Docling succeeds"),
    )

    result = dp.convert_with_fallback("some.pdf", doc_id="s1")
    assert result.metadata["engine"] == "docling"


def test_uses_fallback_directly_when_docling_not_importable(monkeypatch):
    monkeypatch.setattr(dp.DoclingProcessor, "available", property(lambda self: False))
    monkeypatch.setattr(
        dp.DoclingProcessor, "convert",
        lambda self, pdf_path, doc_id=None: pytest.fail("must not call convert() when unavailable"),
    )
    monkeypatch.setattr(dp.FallbackProcessor, "convert", lambda self, pdf_path, doc_id=None: _fake_processed("pdfplumber"))

    result = dp.convert_with_fallback("some.pdf", doc_id="s1")
    assert result.metadata["engine"] == "pdfplumber"


def test_prefer_docling_false_skips_docling_entirely(monkeypatch):
    monkeypatch.setattr(
        dp.DoclingProcessor, "available",
        property(lambda self: (_ for _ in ()).throw(AssertionError("must not even check availability"))),
    )
    monkeypatch.setattr(dp.FallbackProcessor, "convert", lambda self, pdf_path, doc_id=None: _fake_processed("pdfplumber"))

    result = dp.convert_with_fallback("some.pdf", doc_id="s1", prefer_docling=False)
    assert result.metadata["engine"] == "pdfplumber"


def test_raises_when_both_engines_fail(monkeypatch):
    monkeypatch.setattr(dp.DoclingProcessor, "available", property(lambda self: True))
    monkeypatch.setattr(
        dp.DoclingProcessor, "convert",
        lambda self, pdf_path, doc_id=None: (_ for _ in ()).throw(RuntimeError("docling broken")),
    )
    monkeypatch.setattr(
        dp.FallbackProcessor, "convert",
        lambda self, pdf_path, doc_id=None: (_ for _ in ()).throw(ValueError("pdfplumber also broken")),
    )

    with pytest.raises(ValueError, match="pdfplumber also broken"):
        dp.convert_with_fallback("some.pdf", doc_id="s1")


def test_process_pdf_and_process_batch_use_the_same_fallback(monkeypatch):
    calls = []
    monkeypatch.setattr(
        dp, "convert_with_fallback",
        lambda pdf_path, doc_id=None, prefer_docling=True: calls.append(pdf_path) or _fake_processed("x"),
    )
    dp.process_pdf("a.pdf")
    dp.process_batch(["a.pdf", "b.pdf"])
    assert calls == ["a.pdf", "a.pdf", "b.pdf"]


def test_pdf_service_uses_fallback_aware_conversion(monkeypatch):
    """services.pdf_service.process_pdf must go through convert_with_fallback, not call
    get_processor().convert() directly (that was the exact bug: it bypassed any fallback)."""
    from services import pdf_service

    monkeypatch.setattr(
        pdf_service, "convert_with_fallback",
        lambda pdf_path, doc_id=None, prefer_docling=True: _fake_processed("pdfplumber_after_docling_crash"),
    )

    class FakeDB:
        def get(self, table, pk):
            return {"study_id": pk, "pdf_path": "uploads/x.pdf"}

        def query(self, table, filters):
            return []

        def insert(self, table, data):
            return data["doc_id"]

        def update(self, table, pk, data):
            return True

        def commit(self):
            pass

    monkeypatch.setattr(pdf_service, "resolve_pdf_path", lambda p: "uploads/x.pdf")
    result = pdf_service.process_pdf("s1", db=FakeDB())
    assert result["processor_engine"] == "pdfplumber_after_docling_crash"
