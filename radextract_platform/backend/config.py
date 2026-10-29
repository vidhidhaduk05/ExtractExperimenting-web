"""Application configuration and settings."""
from __future__ import annotations
import os
from pathlib import Path
from pydantic_settings import BaseSettings


from pydantic import field_validator
from typing import Any


class Settings(BaseSettings):
    # Database
    db_path: str = os.environ.get("DATABASE_PATH") or os.environ.get("RADEXTRACT_DB_PATH") or str(Path(__file__).parent / "radextract.db")

    # Environment
    env: str = os.environ.get("ENV") or os.environ.get("ENVIRONMENT") or "development"

    # JWT
    jwt_secret: str = os.environ.get("SECRET_KEY", "")  # Or set via RADEXTRACT_JWT_SECRET in production
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 15  # short-lived access tokens
    refresh_token_expire_days: int = 30  # long-lived refresh tokens
    contact_email: str = os.environ.get("CONTACT_EMAIL") or os.environ.get("ADMIN_EMAIL") or ""

    @property
    def effective_jwt_secret(self) -> str:
        secret = self.jwt_secret or os.environ.get("SECRET_KEY", "")
        if not secret:
            if self.env == "production":
                raise RuntimeError("RADEXTRACT_JWT_SECRET or SECRET_KEY must be set in production")
            return "radextract-dev-secret-change-in-production"
        return secret

    # LLM Gateway (Biomni-R0 on HPC or remote OpenAI-compatible endpoint)
    llm_api_url: str = (
        (os.environ.get("OPENAI_BASE_URL", "").rstrip("/") + "/chat/completions")
        if os.environ.get("OPENAI_BASE_URL") and not os.environ.get("OPENAI_BASE_URL", "").rstrip("/").endswith("/chat/completions")
        else (os.environ.get("OPENAI_BASE_URL") or os.environ.get("LLM_BASE_URL") or os.environ.get("LLM_API_URL") or "http://127.0.0.1:18000/v1/chat/completions")
    )
    llm_api_key: str = os.environ.get("OPENAI_API_KEY") or os.environ.get("LLM_API_KEY") or "sk-biomni-4f8a29b3c1e7492d80ef7195a62bc34e"
    llm_models_url: str = (
        (os.environ.get("OPENAI_BASE_URL", "").rstrip("/") + "/models")
        if os.environ.get("OPENAI_BASE_URL")
        else (os.environ.get("LLM_MODELS_URL") or "http://127.0.0.1:18000/v1/models")
    )
    llm_model: str = os.environ.get("OPENAI_MODEL") or os.environ.get("LLM_MODEL") or "biomni-r0"
    llm_tool_calling_enabled: bool = True
    llm_tool_call_fallback: bool = True
    llm_provider: str = "gateway"
    llm_request_timeout: int = 90
    llm_max_retries: int = 2

    # TypeSafe Jev / Laya screening
    #   off    -> Jev never called
    #   shadow -> runs alongside and is logged for comparison; the LLM result is still returned
    #   on     -> Jev / Laya result is returned; any failure falls back to the LLM path
    jev_mode: str = os.environ.get("RADEXTRACT_JEV_MODE") or os.environ.get("JEV_MODE") or "on"
    jev_provider: str = os.environ.get("RADEXTRACT_JEV_PROVIDER") or os.environ.get("JEV_PROVIDER") or ("typesafe" if (os.environ.get("RADEXTRACT_JEV_API_KEY") or os.environ.get("TYPESAFE_API_KEY") or os.environ.get("JEV_API_KEY")) else "laya")  # "typesafe" (remote cloud API) or "laya" (local ONNX)
    laya_model_dir: str = os.environ.get("LAYA_MODEL_DIR") or ""    # Path to local Laya ONNX bundle; defaults to <project_root>/laya/models
    jev_api_key: str = os.environ.get("RADEXTRACT_JEV_API_KEY") or os.environ.get("TYPESAFE_API_KEY") or os.environ.get("JEV_API_KEY") or ""       # For "typesafe" provider
    jev_api_url: str = os.environ.get("JEV_API_URL") or "https://api.typesafe.ai/v1/systemone"
    jev_model: str = os.environ.get("JEV_MODEL") or "jev-latest"
    jev_timeout: int = 30
    jev_max_retries: int = 2
    # Decision policy (validate on labelled data before relying on these)
    jev_include_threshold: float = 0.75   # min(P(population), P(intervention)) needed to include
    jev_exclude_threshold: float = 0.85   # P(mismatch / hard-exclude) needed to exclude
    jev_clarify_band: float = 0.15        # |P - 0.5| below this counts as genuinely ambiguous

    # ClaimScape Fast Pipeline
    claimscape_remote_scan: bool = os.environ.get("CLAIMSCAPE_REMOTE_SCAN", "false").lower() == "true"

    # File storage
    storage_root: str = os.environ.get("STORAGE_ROOT") or os.environ.get("RADEXTRACT_STORAGE_ROOT") or ""
    upload_root: str = os.environ.get("UPLOAD_ROOT") or os.environ.get("RADEXTRACT_UPLOAD_ROOT") or ""
    export_root: str = os.environ.get("EXPORT_ROOT") or os.environ.get("RADEXTRACT_EXPORT_ROOT") or ""

    @property
    def effective_storage_root(self) -> Path:
        """Base local storage directory chosen on disk. Defaults to backend/storage if not set."""
        if self.storage_root and self.storage_root.strip():
            return Path(self.storage_root.strip()).resolve()
        return (Path(__file__).parent / "storage").resolve()

    @property
    def effective_upload_root(self) -> str:
        """Directory for uploaded PDF/references. Resolves to storage_root/UPLOADS if storage_root is set."""
        if self.upload_root and self.upload_root.strip():
            return str(Path(self.upload_root.strip()).resolve())
        if self.storage_root and self.storage_root.strip():
            return str((self.effective_storage_root / "UPLOADS").resolve())
        return str((Path(__file__).parent / "uploads").resolve())

    @property
    def effective_export_root(self) -> str:
        """Directory for generated exports. Resolves to storage_root/EXPORTS if storage_root is set."""
        if self.export_root and self.export_root.strip():
            return str(Path(self.export_root.strip()).resolve())
        if self.storage_root and self.storage_root.strip():
            return str((self.effective_storage_root / "EXPORTS").resolve())
        return str((Path(__file__).parent / "exports").resolve())

    # ── AWS / LocalStack settings (single block — no duplicates) ──
    aws_endpoint_url: str = ""           # "" = real AWS; "http://localhost:4566" = LocalStack
    aws_region: str = "us-east-1"        # Use this consistently (not aws_default_region)
    aws_access_key_id: str = "test"
    aws_secret_access_key: str = "test"
    storage_backend: str = "local"       # "local" | "s3"
    db_backend: str = "sqlite"
    database_url: str = ""           # "sqlite" | "dynamodb"
    s3_pdf_bucket: str = "radextract-pdfs"
    s3_export_bucket: str = "radextract-exports"
    dynamodb_table_prefix: str = "radextract_"

    @property
    def aws_default_region(self) -> str:
        """Backward-compat alias for aws_region."""
        return self.aws_region

    # RadExtract core
    radextract_root: str = str(Path(__file__).parent / "radextract_core")

    # CORS
    cors_origins: Any = os.environ.get("CORS_ORIGINS") or [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "https://vidhidhaduk05.github.io",
    ]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> list[str]:
        raw = os.environ.get("CORS_ORIGINS") or v
        if isinstance(raw, str):
            raw = raw.strip()
            if raw.startswith("[") and raw.endswith("]"):
                try:
                    import json
                    return json.loads(raw)
                except Exception:
                    pass
            return [origin.strip() for origin in raw.split(",") if origin.strip()]
        if isinstance(raw, (list, tuple, set)):
            return [str(x).strip() for x in raw if str(x).strip()]
        return ["*"]

    # Upload limits
    max_upload_mb: int = 500

    # ── Antigravity SDK settings ──
    antigravity_enabled: bool = False  # Master feature flag; endpoints return 503 when False
    antigravity_api_key: str = ""      # Gemini API key (or set GEMINI_API_KEY env var)
    antigravity_model: str = "gemini-2.5-flash"
    antigravity_max_concurrent: int = 3  # Max concurrent agent runs (semaphore)
    antigravity_max_tokens_per_run: int = 50000  # Token budget per study (~$0.01-0.02 at Flash pricing)
    antigravity_save_dir: str = ""  # Directory for session persistence; empty = temp dir

    class Config:
        env_prefix = "RADEXTRACT_"
        # Optional local .env next to this file (git-ignored). Real environment variables still win,
        # and nothing changes when the file does not exist (e.g. on Lambda).
        env_file = str(Path(__file__).parent / ".env")
        extra = "ignore"


settings = Settings()


def ensure_dirs():
    """Create required directories and standard subfolders if they don't exist."""
    # Ensure active storage root and its standard systematic review lifecycle folders
    if settings.storage_root and settings.storage_root.strip():
        root = settings.effective_storage_root
        subdirs = [
            "_INBOX",
            "_BACKUPS",
            "_TEMPLATES",
            "PROJECTS",
            "UPLOADS",
            "EXPORTS",
            "01_SOURCE",
            "02_SCREENING",
            "03_EXTRACTION",
            "04_ROB",
            "05_GRADE",
            "06_META",
            "07_EXPORTS",
            "08_AUDIT",
        ]
        for sub in subdirs:
            (root / sub).mkdir(parents=True, exist_ok=True)

    os.makedirs(settings.effective_upload_root, exist_ok=True)
    os.makedirs(settings.effective_export_root, exist_ok=True)
    Path(settings.db_path).parent.mkdir(parents=True, exist_ok=True)
