import time
import pytest
import uuid
from services import rob_service
from database import reset_db, init_db
from config import settings
import services.db_backend as db_mod


def test_export_rob_benchmark(tmp_path, monkeypatch):
    """Benchmark test for RoB export performance across scale."""
    db_path = str(tmp_path / "bench.db")
    monkeypatch.setattr(settings, "db_path", db_path)
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    db_mod._backend_instance = None
    reset_db()
    init_db()

    pid = str(uuid.uuid4())
    db = db_mod.get_db_backend()
    try:
        db.insert("projects", {"project_id": pid, "name": "Benchmark Project"})
        db.commit()

        # Create 200 studies and 200 assessments
        # Each assessment using 'quadas2' (4 domains, ~11 signaling questions total)
        for i in range(200):
            sid = str(uuid.uuid4())
            db.insert("studies", {
                "study_id": sid,
                "project_id": pid,
                "title": f"Study {i}",
                "authors": f"Author {i}",
                "publication_year": "2023",
                "journal": "Journal of Radiology",
                "doi": f"10.1000/src{i}",
                "study_design": "diagnostic accuracy",
            })
            db.commit()
            rob_service.create_assessment(sid, pid, "quadas2", db=db)
    finally:
        db.close()

    db_mod._backend_instance = None
    db_export = db_mod.get_db_backend()

    try:
        start_time = time.perf_counter()
        filename = rob_service.export_project_rob(pid, format="csv", db=db_export)
        elapsed = time.perf_counter() - start_time
    finally:
        db_export.close()

    print(f"\n[BENCHMARK BASELINE] export_project_rob took {elapsed:.4f} seconds for 200 assessments.")
    assert filename.endswith(".csv")
