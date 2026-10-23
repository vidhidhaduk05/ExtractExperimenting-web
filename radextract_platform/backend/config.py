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
    jev_provider: str = os.environ.get("RADEXTRACT_JEV_PROVIDER") or os.environ.get("JEV_PROVIDER") or "typesafe"  # "typesafe" (remote cloud API) with "laya" (local ONNX) backup
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

    # File storage
    upload_root: str = os.environ.get("UPLOAD_ROOT") or os.environ.get("RADEXTRACT_UPLOAD_ROOT") or str(Path(__file__).parent / "uploads")
    export_root: str = os.environ.get("EXPORT_ROOT") or os.environ.get("RADEXTRACT_EXPORT_ROOT") or str(Path(__file__).parent / "exports")

    # ── AWS / LocalStack settings (single block — no duplicates) ──
    aws_endpoint_url: str = ""           # "" = real AWS; "http://localhost:4566" = LocalStack
    aws_region: str = "us-east-1"        # Use this consistently (not aws_default_region)
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
    """Create required directories if they don't exist."""
    os.makedirs(settings.upload_root, exist_ok=True)
    os.makedirs(settings.export_root, exist_ok=True)
    Path(settings.db_path).parent.mkdir(parents=True, exist_ok=True)
