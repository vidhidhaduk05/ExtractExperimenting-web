"""Benchmark script to measure query counts and execution time for project export endpoints."""
import asyncio
import time
import uuid
import pytest
from database import reset_db, init_db, get_connection
from services.db_backend import SQLiteBackend
from routers.export import export_project

class QueryCountingSQLiteBackend(SQLiteBackend):
    def __init__(self, conn):
        super().__init__(conn)
        self.query_count = 0
        self.queries = []

    def query(self, table: str, filters: dict, order_by: str = "", limit: int = 0) -> list[dict]:
        self.query_count += 1
        self.queries.append((table, filters))
        return super().query(table, filters, order_by, limit)

    def get(self, table: str, pk_value: str) -> dict:
        self.query_count += 1
        self.queries.append((table, {"pk": pk_value}))
        return super().get(table, pk_value)


def setup_benchmark_data(num_studies=50, num_variables=10):
    conn = get_connection()
    db = SQLiteBackend(conn)

    pid = f"proj_bench_{uuid.uuid4().hex[:8]}"
    uid = f"user_{uuid.uuid4().hex[:8]}"

    db.insert("projects", {"project_id": pid, "name": "Benchmark Project"})
    db.insert("users", {"user_id": uid, "username": f"bench_{uid}", "password_hash": "x", "role": "owner"})
    db.insert("project_members", {
        "member_id": f"mem_{uuid.uuid4().hex[:8]}",
        "project_id": pid,
        "user_id": uid,
        "role": "owner",
    })

    variables = []
    for i in range(num_variables):
        vid = f"var_{i}_{uuid.uuid4().hex[:6]}"
        db.insert("variables", {
            "variable_id": vid,
            "project_id": pid,
            "section": f"Section_{i % 3}",
            "name": f"Variable_{i}",
            "field_type": "text",
            "order_index": i,
        })
        variables.append(vid)

    studies = []
    for i in range(num_studies):
        sid = f"study_{i}_{uuid.uuid4().hex[:6]}"
        db.insert("studies", {
            "study_id": sid,
            "project_id": pid,
            "title": f"Study {i}",
            "authors": f"Author {i}",
            "publication_year": 2020 + (i % 5),
            "journal": "Journal of Testing",
            "doi": f"10.1000/{sid}",
        })
        studies.append(sid)

        # Extractions for each study and variable
        for vid in variables:
            db.insert("extractions", {
                "extraction_id": f"ext_{uuid.uuid4().hex[:8]}",
                "study_id": sid,
                "variable_id": vid,
                "value": f"Val_{sid}_{vid}",
            })

        # RoB assessment for each study
        db.insert("rob_assessments", {
            "assessment_id": f"rob_{uuid.uuid4().hex[:8]}",
            "study_id": sid,
            "project_id": pid,
            "tool": "ROB2",
            "overall_judgment": "low",
        })

    db.commit()
    return pid, uid, conn


async def run_export_benchmark():
    reset_db()
    init_db()

    num_studies = 50
    num_variables = 10
    pid, uid, conn = setup_benchmark_data(num_studies=num_studies, num_variables=num_variables)
    user = {"user_id": uid, "sub": uid}

    # Benchmark XLSX Export
    counting_db_xlsx = QueryCountingSQLiteBackend(conn)
    t0 = time.perf_counter()
    res_xlsx = await export_project(
        project_id=pid,
        format="xlsx",
        include_rob=True,
        user=user,
        db=counting_db_xlsx
    )
    t1 = time.perf_counter()
    xlsx_time = t1 - t0
    xlsx_queries = counting_db_xlsx.query_count

    # Benchmark CSV Export
    counting_db_csv = QueryCountingSQLiteBackend(conn)
    t0 = time.perf_counter()
    res_csv = await export_project(
        project_id=pid,
        format="csv",
        include_rob=True,
        user=user,
        db=counting_db_csv
    )
    t1 = time.perf_counter()
    csv_time = t1 - t0
    csv_queries = counting_db_csv.query_count

    print("\n" + "="*50)
    print(f"BENCHMARK BASELINE RESULTS ({num_studies} studies, {num_variables} variables = {num_studies*num_variables} extractions)")
    print("="*50)
    print(f"XLSX Export Time:    {xlsx_time:.4f}s | Query Count: {xlsx_queries}")
    print(f"CSV Export Time:     {csv_time:.4f}s | Query Count: {csv_queries}")
    print("="*50)

    conn.close()
    return {
        "xlsx_time": xlsx_time, "xlsx_queries": xlsx_queries,
        "csv_time": csv_time, "csv_queries": csv_queries
    }

if __name__ == "__main__":
    asyncio.run(run_export_benchmark())
