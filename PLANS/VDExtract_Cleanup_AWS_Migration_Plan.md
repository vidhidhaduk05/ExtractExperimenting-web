# VDExtract: Code Cleanup + AWS Production Migration Plan

## Summary

VDExtract (RadExtract) is a systematic review data extraction platform for radiology research. It has a FastAPI backend (21 routers, 42 services, SQLite with 21 tables), a React/Vite frontend, and a gemini-web2api LLM gateway. Previous agents partially implemented AWS abstractions (storage backend, DB backend, Lambda handler) but left significant duplication, dead code, and an incomplete migration. This plan cleans up the codebase and completes the full migration to an AWS serverless architecture (S3 + DynamoDB + Lambda + API Gateway), using **LocalStack via pip** (no Docker) for local development.

**Key constraint: No Docker.** All services run as native processes. LocalStack is installed via pip and runs in `--host` mode without Docker.

---

## Phase 1: Code Cleanup — Remove Duplicates, Dead Code, Fix Config

### 1A. Delete duplicate and dead files

**Delete these files/directories (verified duplicates or dead code):**

| Path | Reason |
|---|---|
| `radextract_platform/backend/radextract_core/configs_existing/` | Identical copy of `configs/`. Verified with `diff` — all files match. |
| `radextract_platform/backend/radextract_core/tests_existing/` | Older test suite (test_01–test_09). Superseded by `tests/` which has newer, named tests. The `tests_existing/` tests are not in the pytest `testpaths` config (only `tests` and `radextract_core/tests` are). |
| `radextract_platform/backend/services/aws_init.py` | Dead code. Contains its own `init_dynamodb_tables()` and `init_s3_bucket()` that are never called. The active initializers are `db_backend.py::init_dynamodb_tables()` (called from `database.py::init_db()`) and `storage_backend.py::init_s3_buckets()` (called from `main.py::lifespan`). Also has a separate `TABLE_DEFINITIONS` list that conflicts with `db_backend.py::TABLE_PK`. |
| `radextract_platform/backend/services/playwright_service.py` | Dead code. Not imported by any router or service. |
| `radextract_platform/backend/services/logging_config.py` | Dead code. Created per Plan 3 but never imported by `main.py` or any router. |
| `radextract_platform/backend/services/metrics.py` | Dead code. Created per Plan 3 but never imported by `main.py` or any router. |
| `radextract_platform/graphify-out/` | Duplicate graphify output. The canonical graph is at `graphify-out/` (root). The one inside `radextract_platform/` is a stale copy with different content. |
| `gemini-web2api-main/start.bat` | Duplicate of `gemini-web2api-main/gemini-web2api-main/start.bat`. Verified identical with `diff`. |
| `CLAUDE.md` | Identical to `AGENTS.md`. Verified with `diff` — zero differences. |
| `GEMINI.md` | Identical to `AGENTS.md`. Verified with `diff` — zero differences. |
| `graphify-cline.md` | Near-identical to `.clinerules`. Both say the same thing about graphify navigation. Keep `.clinerules` (standard Cline config file), delete `graphify-cline.md`. |
| `PLAN_tool_calling.md` | Root-level draft. Superseded by `PLANS/PLAN_3_TOOL_CALLING_PRODUCTION.md`. |
| `Plan_ PDF Viewer Fix & AI Pipeline Hardening for VDExtract.md` | Root-level draft. Content absorbed into PLANS/ files. |
| `Plan_ Production-Ready AI Pipeline for VDExtract.md` | Root-level draft. Content absorbed into PLANS/ files. |
| `TEST PROTOCOL.docx` | Binary doc file. Not referenced by code. Move to a `docs/` folder if needed, otherwise delete. |
| `docker-compose.yml` | Docker-based. Replaced by local dev scripts (Phase 3). |
| `docker-compose.floci.yml` | Docker-based. Replaced. |
| `docker-compose.prod.yml` | Docker-based. Replaced by AWS deployment config (Phase 5). |
| `radextract_platform/backend/Dockerfile` | Docker-based. Replaced. |
| `radextract_platform/frontend/Dockerfile` | Docker-based. Replaced. |
| `radextract_platform/frontend/nginx.conf` | Docker nginx config. No longer needed without Docker. |
| `.github/workflows/deploy-aws.yml` | Docker-based deployment. Replaced with non-Docker AWS deployment workflow (Phase 5). |
| `sync-to-github.bat` | Windows batch script for git push. Not needed — use standard git commands. |
| `start-radextract.bat` | Windows batch script. Replaced by cross-platform startup scripts (Phase 3). |
| `package-lock.json` (root) | Root-level npm lock file with no package.json. Stale artifact. |

**Flatten the gemini-web2api directory nesting:**
- Move `gemini-web2api-main/gemini-web2api-main/*` up to `gemini-web2api-main/`
- Delete the now-empty inner directory
- Result: `gemini-web2api-main/` contains the project directly (Dockerfile, gemini_web2api/, etc.)

### 1B. Fix config.py — Remove duplicate AWS settings

**File:** `radextract_platform/backend/config.py`

**Problem:** AWS settings are defined twice (lines 34–41 and 60–68). The second block silently overrides the first. Field names conflict: `aws_default_region` (line 37) vs `aws_region` (line 61). Services use both names inconsistently:
- `aws_init.py` (being deleted) used `aws_default_region`
- `db_backend.py` and `storage_backend.py` use `aws_region`

**Fix:** Keep only one set of AWS settings. Standardize on `aws_region` (matches what the surviving services use). Remove the first block (lines 34–41) and keep the second block (lines 60–68), but add `aws_default_region` as an alias property for backward compatibility:

```python
class Settings(BaseSettings):
    # ... existing non-AWS settings ...

    # ── AWS / LocalStack settings ──
    aws_endpoint_url: str = ""           # "" = real AWS; "http://localhost:4566" = LocalStack
    aws_region: str = "us-east-1"
    aws_access_key_id: str = "test"
    aws_secret_access_key: str = "test"
    storage_backend: str = "local"       # "local" | "s3"
    db_backend: str = "sqlite"           # "sqlite" | "dynamodb"
    s3_pdf_bucket: str = "radextract-pdfs"
    s3_export_bucket: str = "radextract-exports"
    dynamodb_table_prefix: str = "radextract_"

    @property
    def aws_default_region(self) -> str:
        """Backward-compat alias for aws_region."""
        return self.aws_region

    class Config:
        env_prefix = "RADEXTRACT_"
```

**Also fix:** Remove the hardcoded JWT secret default. In production, the app should refuse to start without `RADEXTRACT_JWT_SECRET` set:

```python
    jwt_secret: str = ""  # Must be set via RADEXTRACT_JWT_SECRET env var

    @property
    def effective_jwt_secret(self) -> str:
        if not self.jwt_secret:
            if self.env == "production":
                raise RuntimeError("RADEXTRACT_JWT_SECRET must be set in production")
            return "radextract-dev-secret"  # dev-only fallback
        return self.jwt_secret
```

Add `env: str = "development"` field to Settings. Update all references from `settings.jwt_secret` to `settings.effective_jwt_secret` in `dependencies.py`.

### 1C. Consolidate citation services

**Problem:** Two citation services exist with overlapping functionality:
- `citation_engine.py` — exports `study_to_bibtex()`, `study_to_ris()`, `generate_formatted_bibliography()`. Imported by `scientific_exports.py`.
- `citation_service.py` — exports `generate_citation()`, `generate_citations()` with 6 citation formats (Vancouver, APA, MLA, Chicago, Harvard, BibTeX). Imported by `studies.py`.

**Fix:** Merge `citation_engine.py` into `citation_service.py`. Add `study_to_bibtex()`, `study_to_ris()`, and `generate_formatted_bibliography()` as functions in `citation_service.py` (they can delegate to existing `generate_citation()` logic). Update `scientific_exports.py` to import from `citation_service` instead. Delete `citation_engine.py`.

### 1D. Wire in production hardening services (or delete them)

**Problem:** `logging_config.py` and `metrics.py` were created but never wired into `main.py`.

**Decision:** Wire them in (they're useful for AWS production). In `main.py`:
- Import and call `setup_logging()` in the lifespan startup
- Add `MetricsCollector` as a FastAPI middleware
- Add the global exception handler
- Add the `/api/health` endpoint with backend info (replace the existing simple health check)

**If the next agent prefers not to wire them in:** Delete both files instead. Do not leave dead code.

### 1E. Clean up the radextract_core module structure

**Current state:** `radextract_core/` has two sub-packages:
- `litextract/` — 15 modules: the core extraction pipeline (OCR, layout, table extraction, reconciliation, validation, writing)
- `radextract/` — 5 modules: document processing, dual writer, PICO schema generation, screening

`radextract/` imports from `litextract/` (document_processor imports `litextract.document`, dual_writer imports `litextract.writer`). Only `radextract.document_processor` is imported by the backend services (`pdf_service.py`).

**Fix:** No structural change needed — the two packages serve different layers. But update `AGENTS.md` to document this relationship. Remove the stale node count ("2,600+ nodes, 4,700+ edges") and update to the actual count from `GRAPH_REPORT.md` (4209 nodes, 7130 edges).

### 1F. Update .gitignore

Add entries for LocalStack and non-Docker local dev:
```
# LocalStack
.localstack/
*.localstack.json

# Local dev data
radextract_platform/backend/data/
radextract_platform/backend/uploads/
radextract_platform/backend/exports/

# Environment
.env
.env.local
```

Remove Docker-related entries if they're no longer relevant.

### 1G. Verify cleanup

```bash
cd radextract_platform/backend
python -m pytest tests/ -v --tb=short
# All tests must pass after cleanup
python -c "from main import create_app; app = create_app(); print('App creates successfully')"
```

**Commit:** `cleanup: remove duplicates, dead code, fix config`

---

## Phase 2: LocalStack Setup (No Docker)

### 2A. Install LocalStack via pip

LocalStack can run without Docker using the `--host` mode (installs services as native processes). However, this mode has limitations — Lambda and API Gateway emulation require Docker. For S3 and DynamoDB (the core services we need), `--host` mode works.

**Install:**
```bash
pip install localstack
pip install localstack-ext  # extended services
```

**Start LocalStack (no Docker):**
```bash
localstack start --host -p 4566
```

This starts S3, DynamoDB, IAM, STS, and CloudWatch on `http://localhost:4566`.

**Note:** Lambda and API Gateway emulation will not work in `--host` mode. For local development, the FastAPI app runs directly via uvicorn (not in Lambda). Lambda packaging is tested separately with mock events. API Gateway is only configured for AWS deployment (Phase 5).

### 2B. Create local dev startup scripts

**File:** `dev-start.sh` (root, cross-platform via Python)

Create a Python-based startup script that launches all services as native processes:

```python
#!/usr/bin/env python3
"""Start all VDExtract services for local development (no Docker)."""
import subprocess
import sys
import os
import time
import signal

PROCESSES = []

def start_localstack():
    """Start LocalStack in host mode."""
    p = subprocess.Popen(["localstack", "start", "--host", "-p", "4566"],
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    PROCESSES.append(("localstack", p))
    time.sleep(5)  # wait for LocalStack to be ready
    # Initialize S3 buckets and DynamoDB tables
    subprocess.run([sys.executable, "-m", "scripts.init_aws_local"],
                   cwd="radextract_platform/backend")

def start_llm_gateway():
    """Start gemini-web2api LLM gateway."""
    p = subprocess.Popen([sys.executable, "gemini_web2api.py"],
                         cwd="gemini-web2api-main",
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    PROCESSES.append(("llm-gateway", p))

def start_backend():
    """Start FastAPI backend."""
    env = os.environ.copy()
    env.update({
        "RADEXTRACT_ENV": "development",
        "RADEXTRACT_DB_BACKEND": "sqlite",  # start with SQLite, switch to dynamodb later
        "RADEXTRACT_STORAGE_BACKEND": "local",  # start with local, switch to s3 later
        "RADEXTRACT_AWS_ENDPOINT_URL": "http://localhost:4566",
        "RADEXTRACT_AWS_REGION": "us-east-1",
        "RADEXTRACT_AWS_ACCESS_KEY_ID": "test",
        "RADEXTRACT_AWS_SECRET_ACCESS_KEY": "test",
        "RADEXTRACT_LLM_API_URL": "http://localhost:8081/v1/chat/completions",
        "RADEXTRACT_LLM_MODELS_URL": "http://localhost:8081/v1/models",
    })
    p = subprocess.Popen([sys.executable, "-m", "uvicorn", "main:app",
                          "--reload", "--host", "0.0.0.0", "--port", "8000"],
                         cwd="radextract_platform/backend", env=env)
    PROCESSES.append(("backend", p))

def start_frontend():
    """Start Vite dev server."""
    p = subprocess.Popen(["npm", "run", "dev"],
                         cwd="radextract_platform/frontend")
    PROCESSES.append(("frontend", p))

def cleanup(*args):
    for name, p in PROCESSES:
        p.terminate()
    sys.exit(0)

if __name__ == "__main__":
    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    print("Starting LocalStack...")
    start_localstack()
    print("Starting LLM gateway...")
    start_llm_gateway()
    time.sleep(2)
    print("Starting backend...")
    start_backend()
    time.sleep(2)
    print("Starting frontend...")
    start_frontend()
    print("\nAll services running:")
    print("  LocalStack:  http://localhost:4566")
    print("  LLM Gateway: http://localhost:8081")
    print("  Backend API: http://localhost:8000/docs")
    print("  Frontend:    http://localhost:5173")
    print("\nPress Ctrl+C to stop all services.")

    for name, p in PROCESSES:
        p.wait()
```

**File:** `dev-stop.sh` — kills all services by port.

**File:** `radextract_platform/backend/scripts/init_aws_local.py` — initializes S3 buckets and DynamoDB tables against LocalStack:

```python
"""Initialize AWS resources against LocalStack (no Docker)."""
import boto3

ENDPOINT = "http://localhost:4566"
REGION = "us-east-1"
KEY = "test"
SECRET = "test"

def init_s3():
    s3 = boto3.client("s3", endpoint_url=ENDPOINT, region_name=REGION,
                      aws_access_key_id=KEY, aws_secret_access_key=SECRET)
    for bucket in ["radextract-pdfs", "radextract-exports"]:
        try:
            s3.create_bucket(Bucket=bucket)
            print(f"Created S3 bucket: {bucket}")
        except s3.exceptions.BucketAlreadyOwnedByYou:
            print(f"S3 bucket already exists: {bucket}")

def init_dynamodb():
    from services.db_backend import init_dynamodb_tables
    from config import settings
    settings.aws_endpoint_url = ENDPOINT
    settings.db_backend = "dynamodb"
    init_dynamodb_tables()
    print("DynamoDB tables initialized")

if __name__ == "__main__":
    init_s3()
    # Only init DynamoDB if switching to DynamoDB mode
    if os.environ.get("RADEXTRACT_DB_BACKEND") == "dynamodb":
        init_dynamodb()
```

### 2C. Update .env.example

**File:** `radextract_platform/backend/.env.example`

```env
# Backend environment variables
# Copy to .env and adjust as needed
# All variables use the RADEXTRACT_ prefix

# Environment
RADEXTRACT_ENV=development

# JWT (MUST be set in production)
# RADEXTRACT_JWT_SECRET=your-secret-here

# LLM Gateway (gemini-web2api)
RADEXTRACT_LLM_API_URL=http://localhost:8081/v1/chat/completions
RADEXTRACT_LLM_API_KEY=gemini-web2api-token
RADEXTRACT_LLM_MODELS_URL=http://localhost:8081/v1/models

# CORS (comma-separated list)
# RADEXTRACT_CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]

# Database
# RADEXTRACT_DB_PATH=./radextract.db

# File storage
# RADEXTRACT_UPLOAD_ROOT=./uploads
# RADEXTRACT_EXPORT_ROOT=./exports

# AWS / LocalStack (local dev)
RADEXTRACT_AWS_ENDPOINT_URL=http://localhost:4566
RADEXTRACT_AWS_REGION=us-east-1
RADEXTRACT_AWS_ACCESS_KEY_ID=test
RADEXTRACT_AWS_SECRET_ACCESS_KEY=test
RADEXTRACT_STORAGE_BACKEND=local
RADEXTRACT_DB_BACKEND=sqlite
RADEXTRACT_S3_PDF_BUCKET=radextract-pdfs
RADEXTRACT_S3_EXPORT_BUCKET=radextract-exports
RADEXTRACT_DYNAMODB_TABLE_PREFIX=radextract_

# For real AWS production: unset RADEXTRACT_AWS_ENDPOINT_URL
# and use real IAM credentials via standard AWS env vars
```

**Commit:** `feat: add LocalStack no-Docker local dev setup`

---

## Phase 3: Complete Storage Migration (Local → S3)

### 3A. Verify storage abstraction is complete

The `storage_backend.py` already has `LocalStorage`, `S3Storage`, `get_storage()`, and `init_s3_buckets()`. Verify:
- `pdf_service.py` uses `get_storage()` for all file I/O (already refactored per commit `bea2159`)
- `studies.py` router uses `get_storage()` for PDF upload/download (already refactored)
- No remaining direct file I/O (`open()`, `os.remove()`, `Path.write_bytes()`) in PDF-related code

**Check:** `grep -rn "open(" radextract_platform/backend/services/pdf_service.py radextract_platform/backend/routers/studies.py | grep -v "# " | grep -v "BinaryIO"`

If any direct file I/O remains, replace with `get_storage()` calls.

### 3B. Test S3 storage with LocalStack

```bash
# Start LocalStack
localstack start --host -p 4566 &

# Set env to use S3
export RADEXTRACT_STORAGE_BACKEND=s3
export RADEXTRACT_AWS_ENDPOINT_URL=http://localhost:4566

# Start backend
cd radextract_platform/backend
python -m uvicorn main:app --reload

# Test PDF upload
curl -X POST http://localhost:8000/api/studies/{study_id}/upload-pdf -F "file=@test.pdf"

# Verify in LocalStack S3
aws --endpoint-url http://localhost:4566 s3 ls s3://radextract-pdfs/

# Test PDF download
curl http://localhost:8000/api/studies/{study_id}/pdf-file -o downloaded.pdf
```

### 3C. Add storage backend to health check

Update the `/api/health` endpoint to report storage backend status:

```python
@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "version": "2.4.0",
        "env": settings.env,
        "db_backend": settings.db_backend,
        "storage_backend": settings.storage_backend,
        "aws_endpoint": settings.aws_endpoint_url or "real AWS",
    }
```

**Commit:** `feat: complete S3 storage migration with LocalStack testing`

---

## Phase 4: Complete Database Migration (SQLite → DynamoDB)

This is the largest phase. 236 raw SQL `conn.execute()` calls across 14 routers plus 53 `get_connection()` calls across 11 services and 10 in `dependencies.py` must be migrated to the `DBBackend` abstraction.

### 4A. Fix dependencies.py to use DBBackend

**File:** `radextract_platform/backend/dependencies.py`

Currently uses `get_connection()` directly (10 calls) for auth, session management, and project access control. These all use raw SQL and won't work with DynamoDB.

**Refactor:** Replace `get_connection()` with `get_db_backend()` for all database operations. The `DBBackend` interface provides `get()`, `query()`, `insert()`, `update()`, `delete()`, and `count()` methods that work with both SQLite and DynamoDB.

**Specific changes:**
- `create_user()` → `db.insert("users", {...})`
- `authenticate_user()` → `db.query("users", {"username": username})` then verify password
- `get_current_user()` → `db.get("users", user_id)`
- `create_refresh_token()` → `db.insert("sessions", {...})`
- `verify_refresh_token()` → This does a JOIN (sessions + users). Decompose into `db.query("sessions", {"refresh_token": token_hash})` then `db.get("users", session.user_id)`.
- `revoke_session()` → `db.update("sessions", session_id, {"is_revoked": 1})`
- `revoke_all_user_sessions()` → `db.query("sessions", {"user_id": user_id})` then update each
- `list_user_sessions()` → `db.query("sessions", {"user_id": user_id})` with application-level filtering for non-expired
- `get_user_project_role()` → `db.query("project_members", {"user_id": user_id, "project_id": project_id})`
- `check_project_access()` → Uses `get_user_project_role()` (already refactored)
- `resolve_study_project_id()` → `db.get("studies", study_id)` then return `project_id` field

**Add `refresh_token` and `username` to GSI definitions** in `db_backend.py`:
- `sessions` table: add GSI on `refresh_token` (for token lookup) and `user_id` (for listing sessions)
- `users` table: add GSI on `username` (for login lookup)

Update `STUDY_GSI_TABLES` and `PROJECT_GSI_TABLES` in `db_backend.py` to include these new GSIs. Also add a general GSI mechanism for arbitrary fields.

### 4B. Migrate routers to DBBackend

**Migration order (by SQL complexity, simplest first):**

**Tier 1 — Simple CRUD (no JOINs):**

| Router | SQL calls | Key patterns |
|---|---|---|
| `review.py` | 7 | SELECT with JOIN (extractions + variables). Decompose into two queries + Python assembly. |
| `export.py` | 10 | SELECT from multiple tables. No JOINs — straightforward. |
| `pdf_highlights.py` | 11 | CRUD on pdf_highlights table. Straightforward. |
| `variables.py` | 10 | CRUD on variables table. Straightforward. |
| `analysis.py` | 2 | Minimal SQL. |
| `graphify.py` | 6 | Reads from multiple tables. No JOINs. |
| `scientific_exports.py` | 3 | Minimal SQL. |
| `pubmed.py` | 3 | Minimal SQL. |

**Tier 2 — Complex queries (JOINs, aggregates):**

| Router | SQL calls | Key patterns |
|---|---|---|
| `extraction.py` | 19 | CRUD on extractions + audit_log. JOIN with variables for review. Decompose JOINs. |
| `meta.py` | 19 | CRUD on meta_analyses + meta_analysis_studies. JOINs for listing. |
| `rob.py` | 12 | CRUD on rob_assessments + rob_domain_judgments + rob_signaling_answers. Three-table JOINs. |
| `studies.py` | 28 | CRUD on studies + PDF operations. JOINs for listing with screening decisions. |
| `projects.py` | 43 | CRUD on projects + criteria + search strings + screening config. Complex multi-table operations. |
| `screening.py` | 63 | Largest router. CRUD on screening_decisions + screening_conflicts. Complex JOINs for conflict detection. |

**Tier 3 — Routers with no SQL (already service-backed):**
- `charts.py`, `statistics.py`, `grade.py`, `biomni.py`, `auth.py`, `literature_search.py` — These delegate to services. No router-level SQL to migrate.

**Migration pattern for each router:**

1. Change the dependency from `conn: sqlite3.Connection = Depends(get_db)` to `db: DBBackend = Depends(get_db)`
2. Replace `conn.execute("SELECT * FROM table WHERE pk = ?", (id,)).fetchone()` with `db.get("table", id)`
3. Replace `conn.execute("SELECT * FROM table WHERE fk = ?", (fk,)).fetchall()` with `db.query("table", {"fk": fk})`
4. Replace `conn.execute("INSERT INTO table (col1, col2) VALUES (?, ?)", (v1, v2))` with `db.insert("table", {"col1": v1, "col2": v2})`
5. Replace `conn.execute("UPDATE table SET col1 = ? WHERE pk = ?", (v1, id))` with `db.update("table", id, {"col1": v1})`
6. Replace `conn.execute("DELETE FROM table WHERE pk = ?", (id,))` with `db.delete("table", id)`
7. Replace `conn.execute("SELECT COUNT(*) ...").fetchone()["c"]` with `db.count("table", filters)`
8. For JOINs: decompose into multiple `db.query()` calls and assemble in Python
9. For `conn.commit()` → `db.commit()`
10. Remove `import sqlite3` (no longer needed in routers)

**JOIN decomposition example (review.py):**

Before:
```python
rows = conn.execute(
    """SELECT e.*, v.name as variable_name
       FROM extractions e
       LEFT JOIN variables v ON e.variable_id = v.variable_id
       WHERE e.study_id = ?""",
    (s["study_id"],),
).fetchall()
```

After:
```python
extractions = db.query("extractions", {"study_id": s["study_id"]})
variables = db.query("variables", {"project_id": project_id})
var_map = {v["variable_id"]: v for v in variables}
for ext in extractions:
    ext["variable_name"] = var_map.get(ext["variable_id"], {}).get("name", "")
```

### 4C. Migrate services to DBBackend

11 services use `get_connection()` directly (53 calls total):

| Service | get_connection calls | Key operations |
|---|---|---|
| `pdf_service.py` | ~5 | CRUD on pdf_documents table |
| `rob_service.py` | ~8 | CRUD on rob tables, complex JOINs |
| `analysis_service.py` | ~6 | Reads from extractions, variables, studies |
| `grade_service.py` | ~5 | CRUD on grade tables |
| `auto_extract_service.py` | ~4 | Reads/updates extractions |
| `dedup_service.py` | ~4 | Reads/updates studies for duplicate detection |
| `ai_screening_service.py` | ~4 | Reads studies, writes screening decisions |
| `docling_extract_service.py` | ~3 | Reads studies, writes extractions |
| `pipeline_service.py` | ~5 | Orchestrates multiple services |
| `pubmed_service.py` | ~5 | CRUD on studies |
| `db_backend.py` | ~4 | Internal (this is the abstraction itself — leave as-is) |

**Refactor pattern:** Same as routers. Replace `get_connection()` with `get_db_backend()`, replace raw SQL with `DBBackend` methods.

**For services that need JOINs:** Create helper functions in a new `services/db_helpers.py`:
```python
def get_project_studies(db, project_id):
    return db.query("studies", {"project_id": project_id})

def get_project_variables(db, project_id):
    return db.query("variables", {"project_id": project_id})

def get_study_extractions(db, study_id):
    return db.query("extractions", {"study_id": study_id})

def get_project_extractions(db, project_id):
    studies = get_project_studies(db, project_id)
    result = []
    for s in studies:
        result.extend(get_study_extractions(db, s["study_id"]))
    return result

def get_study_rob_assessment(db, study_id):
    return db.query("rob_assessments", {"study_id": study_id})
```

### 4D. Update DBBackend for missing features

**Add to `db_backend.py`:**

1. **GSI for `username` on users table** — needed for login
2. **GSI for `refresh_token` on sessions table** — needed for token verification
3. **`query_all` method** — for queries that need to scan entire tables (used by export, graphify)
4. **`batch_write` method** — for bulk inserts (used by seed scripts, batch import)
5. **Handle `ORDER BY` in DynamoDB** — DynamoDB doesn't support ORDER BY. Sort in Python after query.
6. **Handle `LIMIT` in DynamoDB** — Use `Limit` parameter in query/scan.

**Update `TABLE_PK` in `db_backend.py`:**
Add missing tables:
```python
"sessions": "session_id",
"project_members": "member_id",
"user_review_state": "state_id",
```
(These may already be present — verify.)

**Update GSI sets:**
```python
# Add username GSI for users
"users": {"username"},  # new GSI set

# Add refresh_token GSI for sessions
"sessions": {"user_id", "refresh_token"},  # new GSI set
```

### 4E. Update tests for dual-backend compatibility

**File:** `radextract_platform/backend/tests/conftest.py`

Ensure the test fixture creates a fresh SQLite database for each test (already does this via `reset_db()`). Add a marker for DynamoDB tests:

```python
import pytest
from database import reset_db, init_db

@pytest.fixture
def fresh_db():
    """Reset SQLite database for each test."""
    reset_db()
    yield

@pytest.fixture
def dynamodb_db():
    """Use DynamoDB backend via LocalStack."""
    # Only run if LocalStack is available
    import boto3
    try:
        client = boto3.client("dynamodb", endpoint_url="http://localhost:4566",
                              region_name="us-east-1",
                              aws_access_key_id="test",
                              aws_secret_access_key="test")
        client.list_tables()
    except Exception:
        pytest.skip("LocalStack not available")
    # Set env to dynamodb
    os.environ["RADEXTRACT_DB_BACKEND"] = "dynamodb"
    os.environ["RADEXTRACT_AWS_ENDPOINT_URL"] = "http://localhost:4566"
    # Reset singleton
    import services.db_backend
    services.db_backend._backend_instance = None
    init_db()
    yield
    # Cleanup
    os.environ["RADEXTRACT_DB_BACKEND"] = "sqlite"
    services.db_backend._backend_instance = None
```

### 4F. Verify database migration

```bash
# Test with SQLite (default)
cd radextract_platform/backend
python -m pytest tests/ -v --tb=short

# Test with DynamoDB via LocalStack
localstack start --host -p 4566 &
RADEXTRACT_DB_BACKEND=dynamodb RADEXTRACT_AWS_ENDPOINT_URL=http://localhost:4566 \
python -m pytest tests/ -v --tb=short

# Manual API test with DynamoDB
RADEXTRACT_DB_BACKEND=dynamodb python -m uvicorn main:app --reload
curl -X POST http://localhost:8000/api/projects -H "Content-Type: application/json" -d '{"name":"Test"}'
aws --endpoint-url http://localhost:4566 dynamodb scan --table-name radextract_projects
```

**Commit:** `feat: complete DynamoDB database migration with DBBackend abstraction`

---

## Phase 5: Lambda Packaging + API Gateway (AWS Deployment)

### 5A. Verify Lambda handler

**File:** `radextract_platform/backend/lambda_handler.py` (already exists)

Verify it works with mock API Gateway events:
```python
# Test locally
from lambda_handler import handler
import json

mock_event = {
    "httpMethod": "GET",
    "path": "/api/health",
    "headers": {},
    "body": None,
    "queryStringParameters": {},
}
response = handler(mock_event, None)
print(response)
```

### 5B. Create AWS deployment configuration

**File:** `deploy/aws-deploy.py` — Python-based deployment script (no Docker, no SAM CLI dependency):

```python
"""Deploy VDExtract to AWS (no Docker required).

Uses boto3 to:
1. Package Lambda function (zip the backend code)
2. Create/update Lambda function
3. Create/update API Gateway HTTP API
4. Configure routes
5. Set up S3 buckets and DynamoDB tables
6. Deploy frontend to S3 + CloudFront

Prerequisites:
- AWS credentials configured (via env vars, ~/.aws/credentials, or IAM role)
- Python 3.11+ with boto3
- Node.js 20+ for frontend build
"""
```

**File:** `deploy/lambda-package.sh` — packages the backend into a Lambda zip:
```bash
#!/bin/bash
# Package backend for Lambda deployment (no Docker)
cd radextract_platform/backend
pip install --target ./package -r <(python -c "
import tomllib
with open('pyproject.toml', 'rb') as f:
    data = tomllib.load(f)
for dep in data['project']['dependencies']:
    print(dep)
")
cd package
zip -r ../../lambda-deployment.zip .
cd ..
zip -r ../lambda-deployment.zip . -x "package/*" "__pycache__/*" "*.pyc" "tests/*" "data/*" "uploads/*" "exports/*"
```

### 5C. Create AWS infrastructure template

**File:** `deploy/infra.py` — creates AWS resources using boto3 (alternative to CloudFormation/SAM for no-Docker environments):

Resources to create:
1. S3 buckets: `radextract-pdfs`, `radextract-exports`, `radextract-frontend` (static hosting)
2. DynamoDB tables: all 21 tables with GSIs (using `init_dynamodb_tables()`)
3. Lambda function: `radextract-api` (packaged backend)
4. API Gateway HTTP API: route `ANY /{proxy+}` → Lambda
5. CloudFront distribution: serves frontend from S3, proxies `/api/*` to API Gateway
6. IAM roles: Lambda execution role with S3/DynamoDB/CloudWatch permissions
7. CloudWatch log groups

### 5D. Update CI/CD workflow

**File:** `.github/workflows/ci.yml` — update to:
- Run tests with SQLite (no LocalStack needed for CI)
- Run linting
- Build frontend

**File:** `.github/workflows/deploy-aws.yml` — replace Docker-based deployment with:
- Build frontend (`npm run build`)
- Package Lambda function (zip, no Docker)
- Deploy via `deploy/aws-deploy.py`
- Requires AWS credentials as GitHub secrets

### 5E. Frontend deployment

Build the frontend for S3 + CloudFront hosting:
```bash
cd radextract_platform/frontend
VITE_API_BASE_URL=https://api.yourdomain.com/api npm run build
# Upload dist/ to S3 bucket
aws s3 sync dist/ s3://radextract-frontend/ --delete
```

Update `api.ts` to support production API URL:
```typescript
export const API_BASE = import.meta.env.VITE_API_BASE_URL || `http://${API_HOST}:8000/api`;
```

**Commit:** `feat: add AWS Lambda deployment without Docker`

---

## Phase 6: Production Hardening

### 6A. Security

1. **JWT secret:** Already fixed in Phase 1B — app refuses to start without `RADEXTRACT_JWT_SECRET` in production
2. **CORS:** Already env-based via `settings.cors_origins`. Verify production origins are set via env var.
3. **Rate limiting:** `rate_limiter.py` exists and is tested. Wire it into `main.py` as middleware:
   ```python
   from services.rate_limiter import RateLimiter
   rate_limiter = RateLimiter()
   # Add as middleware in create_app()
   ```
4. **Input validation:** Audit `models.py` (660 lines, 68 Pydantic models). Add `max_length`, `ge`, `le`, `pattern` constraints where missing. Focus on user-input fields (project names, study titles, variable names).

### 6B. Monitoring

1. **Structured logging:** Wire `logging_config.py` into `main.py` (or delete if not wiring — see Phase 1D)
2. **Health check:** Already updated in Phase 3C with backend info
3. **Metrics:** Wire `metrics.py` into `main.py` as middleware (or delete)
4. **CloudWatch:** In production, stdout logs are captured by CloudWatch automatically (Lambda). No additional config needed.

### 6C. Error handling

1. **Global exception handler:** Add to `main.py`:
   ```python
   @app.exception_handler(Exception)
   async def global_exception_handler(request, exc):
       logger.error(f"Unhandled exception: {exc}", exc_info=True)
       return JSONResponse(status_code=500, content={"detail": "Internal server error"})
   ```
2. **Circuit breaker:** Already integrated into `tool_calling_client.py` (imports from `circuit_breaker.py`). Verify it's active.

### 6D. Database migration tool

**File:** `radextract_platform/backend/scripts/migrate_sqlite_to_dynamodb.py` (already exists)

Verify it works:
```bash
# Migrate existing SQLite data to DynamoDB via LocalStack
RADEXTRACT_DB_BACKEND=dynamodb RADEXTRACT_AWS_ENDPOINT_URL=http://localhost:4566 \
python -m scripts.migrate_sqlite_to_dynamodb
```

**Commit:** `feat: production hardening — security, monitoring, error handling`

---

## Phase 7: Documentation

### 7A. Update AGENTS.md

- Update node/edge counts to match current graphify output
- Document the `litextract/` vs `radextract/` package relationship
- Add note about LocalStack (no Docker) for local dev
- Remove references to Docker/Floci

### 7B. Update CONTRIBUTING.md

- Document local dev setup (no Docker): `python dev-start.sh`
- Document how to switch between SQLite/DynamoDB and local/S3 storage
- Document test running for both backends

### 7C. Create README.md (if not exists)

- Project overview
- Architecture diagram (text-based)
- Quick start (local dev with LocalStack)
- AWS deployment instructions
- Environment variable reference

---

## File Summary

### Files to DELETE (26 items)
- `radextract_platform/backend/radextract_core/configs_existing/` (entire directory)
- `radextract_platform/backend/radextract_core/tests_existing/` (entire directory)
- `radextract_platform/backend/services/aws_init.py`
- `radextract_platform/backend/services/playwright_service.py`
- `radextract_platform/backend/services/logging_config.py` (if not wiring in Phase 6B)
- `radextract_platform/backend/services/metrics.py` (if not wiring in Phase 6B)
- `radextract_platform/graphify-out/` (entire directory)
- `gemini-web2api-main/start.bat`
- `CLAUDE.md`
- `GEMINI.md`
- `graphify-cline.md`
- `PLAN_tool_calling.md`
- `Plan_ PDF Viewer Fix & AI Pipeline Hardening for VDExtract.md`
- `Plan_ Production-Ready AI Pipeline for VDExtract.md`
- `TEST PROTOCOL.docx`
- `docker-compose.yml`
- `docker-compose.floci.yml`
- `docker-compose.prod.yml`
- `radextract_platform/backend/Dockerfile`
- `radextract_platform/frontend/Dockerfile`
- `radextract_platform/frontend/nginx.conf`
- `.github/workflows/deploy-aws.yml`
- `sync-to-github.bat`
- `start-radextract.bat`
- `package-lock.json` (root)
- `radextract_platform/backend/services/citation_engine.py` (merged into citation_service.py)

### Files to CREATE (8 items)
- `dev-start.sh` — local dev startup script (Python-based, no Docker)
- `dev-stop.sh` — stop all local services
- `radextract_platform/backend/scripts/init_aws_local.py` — LocalStack resource init
- `radextract_platform/backend/services/db_helpers.py` — JOIN decomposition helpers
- `deploy/aws-deploy.py` — AWS deployment script (no Docker)
- `deploy/lambda-package.sh` — Lambda packaging script
- `deploy/infra.py` — AWS infrastructure creation
- `.github/workflows/deploy-aws.yml` — new non-Docker CI/CD deployment

### Files to MODIFY (20+ items)
- `radextract_platform/backend/config.py` — remove duplicate AWS settings, fix JWT secret
- `radextract_platform/backend/main.py` — wire in logging/metrics/health/rate-limiter/exception-handler
- `radextract_platform/backend/dependencies.py` — migrate from get_connection to DBBackend
- `radextract_platform/backend/services/db_backend.py` — add GSIs, helpers, batch_write
- `radextract_platform/backend/services/citation_service.py` — merge citation_engine functions
- `radextract_platform/backend/routers/scientific_exports.py` — update citation import
- `radextract_platform/backend/routers/*.py` (14 routers) — migrate from conn.execute to DBBackend
- `radextract_platform/backend/services/*.py` (10 services) — migrate from get_connection to DBBackend
- `radextract_platform/backend/.env.example` — add LocalStack/AWS settings
- `radextract_platform/frontend/src/lib/api.ts` — support production API URL
- `AGENTS.md` — update documentation
- `CONTRIBUTING.md` — update local dev instructions
- `.gitignore` — add LocalStack and local dev entries
- `.github/workflows/ci.yml` — update for non-Docker testing

---

## Execution Order

| Phase | Task | Est. Hours | Depends On |
|---|---|---|---|
| 1 | Code cleanup (delete duplicates, fix config, merge services) | 3-4 | Nothing |
| 2 | LocalStack setup (no Docker) + dev scripts | 2-3 | Phase 1 |
| 3 | Complete storage migration (verify S3 works) | 2-3 | Phase 2 |
| 4 | Complete database migration (SQLite → DynamoDB) | 12-16 | Phase 2 |
| 5 | Lambda packaging + API Gateway + AWS deploy | 4-6 | Phase 4 |
| 6 | Production hardening (security, monitoring, errors) | 3-4 | Phase 5 |
| 7 | Documentation | 2-3 | Phase 6 |
| **Total** | | **28-39** | |

---

## Acceptance Criteria

1. No duplicate files or directories remain in the repository
2. `config.py` has a single set of AWS settings with no conflicting field names
3. No dead code (every service file is imported by at least one router or other service)
4. `dev-start.sh` launches LocalStack, LLM gateway, backend, and frontend without Docker
5. PDF upload/download works with `RADEXTRACT_STORAGE_BACKEND=s3` against LocalStack
6. All CRUD operations work with `RADEXTRACT_DB_BACKEND=dynamodb` against LocalStack
7. All existing tests pass with both SQLite and DynamoDB backends
8. Lambda handler responds correctly to mock API Gateway events
9. `deploy/aws-deploy.py` creates all AWS resources and deploys the application
10. JWT secret is required in production (app refuses to start without it)
11. Rate limiting, structured logging, and health check are active
12. No Docker files remain (Dockerfiles, docker-compose, nginx.conf)
13. `AGENTS.md` and `CONTRIBUTING.md` reflect the no-Docker architecture

---

## Assumptions

1. **LocalStack `--host` mode** supports S3 and DynamoDB without Docker. Lambda/API Gateway emulation requires Docker and is not available locally — the FastAPI app runs directly via uvicorn for local dev, and Lambda is only tested with mock events.
2. **gemini-web2api** can run as a standalone Python process without Docker. It requires Gemini cookies/auth configured via `config.json`.
3. **The existing `DBBackend` abstraction** in `db_backend.py` is architecturally sound. The `SQLiteBackend.execute()` pass-through allows routers to be migrated incrementally — routers still using `conn.execute()` will work with SQLite but fail with DynamoDB. The migration in Phase 4 makes all routers use the high-level methods.
4. **Frontend** is built with Vite and deployed as static files to S3+CloudFront. No server-side rendering needed.
5. **The `tests_existing/` directory** is safe to delete. Its tests are not in the pytest `testpaths` configuration and are superseded by the `tests/` directory.
6. **The `configs_existing/` directory** is safe to delete. Verified identical to `configs/` via `diff`.
7. **AWS deployment** uses boto3 directly (not SAM/CloudFormation) to avoid Docker dependency for SAM CLI. This is less declarative but works without Docker.
8. **Environment variable `RADEXTRACT_ENV`** controls production vs development behavior. Added in Phase 1B.
