"""FastAPI application factory.

Creates and configures the RadExtract platform API with:
  - CORS middleware
  - All routers (auth, projects, studies, variables, extraction,
    screening, review, export, risk-of-bias)
  - Database initialization on startup
  - Health check endpoint
"""
from __future__ import annotations
import time
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from config import settings, ensure_dirs
from database import init_db
from services.storage_backend import init_s3_buckets
from services.logging_config import setup_logging
from services.metrics import metrics_collector
from services.rate_limiter import RateLimiter
from routers import (
    record_collaboration,
    charts,
    statistics,
    literature_search,
    scientific_exports,
    biomni,
    auth, projects, studies, variables,
    extraction, screening, review, export, rob,
    meta, grade, pubmed,
    analysis,
    graphify,
    pdf_highlights,
    clarification,
    ai_screening,
    agent,
    fulltext,
    rob_run,
    claimscape,
    citation_telephone,
    rigor_scan,
    settings as system_settings,
)

logger = logging.getLogger("radextract")
rate_limiter = RateLimiter(max_requests=300, window_seconds=60.0)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database and storage on startup."""
    setup_logging(
        level="INFO",
        json_format=(settings.env == "production"),
    )
    logger.info(f"Starting RadExtract API (env={settings.env}, db={settings.db_backend}, storage={settings.storage_backend})")
    ensure_dirs()
    init_db()
    init_s3_buckets()
    yield


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="RadExtract Platform API",
        description="Radiology systematic review data extraction with risk-of-bias assessment",
        version="2.4.0",
        lifespan=lifespan,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=[
            "Content-Range",
            "Accept-Ranges",
            "Content-Length",
            "Content-Disposition",
        ],
    )

    # Rate limiting & Metrics middleware
    @app.middleware("http")
    async def metrics_and_rate_limit_middleware(request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"
        # Exempt health checks and local test client from rate limiting
        path = request.url.path
        if not path.startswith("/api/health") and not path.startswith("/health") and client_ip not in ("testclient",):
            if settings.env == "production" and not rate_limiter.check(client_ip):
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many requests. Please slow down."},
                )

        start_time = time.perf_counter()
        success = True
        try:
            response = await call_next(request)
            if response.status_code >= 500:
                success = False
            return response
        except Exception:
            success = False
            raise
        finally:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            metrics_collector.record_request(path, duration_ms, success=success)

    # Global Exception Handler
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.error(f"Unhandled exception on {request.method} {request.url.path}: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )

    # Register routers
    app.include_router(record_collaboration.router)
    app.include_router(auth.router)
    app.include_router(projects.router)
    app.include_router(studies.router)
    app.include_router(variables.router)
    app.include_router(extraction.router)
    app.include_router(screening.router)
    app.include_router(review.router)
    app.include_router(export.router)
    app.include_router(rob.router)
    app.include_router(charts.router)
    app.include_router(statistics.router)
    app.include_router(literature_search.router)
    app.include_router(scientific_exports.router)
    app.include_router(biomni.router)
    app.include_router(meta.router)
    app.include_router(grade.router)
    app.include_router(pubmed.router)
    app.include_router(analysis.router)
    app.include_router(graphify.router)
    app.include_router(pdf_highlights.router)
    app.include_router(clarification.router)
    app.include_router(ai_screening.router)
    app.include_router(agent.router)
    app.include_router(fulltext.router)
    app.include_router(rob_run.router)
    app.include_router(claimscape.router)
    app.include_router(citation_telephone.router)
    app.include_router(rigor_scan.router)
    app.include_router(system_settings.router)

    # Health check
    @app.get("/health")
    @app.get("/api/health")
    async def health():
        return {
            "status": "healthy",
            "version": "2.4.0",
            "env": settings.env,
            "db_backend": settings.db_backend,
            "storage_backend": settings.storage_backend,
            "metrics": metrics_collector.get_stats(),
        }

    # Mount built frontend dist files if present
    import os
    frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
    if os.path.isdir(frontend_dist):
        from fastapi.staticfiles import StaticFiles
        from fastapi.responses import FileResponse

        assets_dir = os.path.join(frontend_dist, "assets")
        if os.path.isdir(assets_dir):
            app.mount("/assets", StaticFiles(directory=assets_dir), name="static-assets")

        @app.get("/{full_path:path}")
        async def serve_spa(full_path: str):
            if full_path.startswith("api/") or full_path.startswith("health") or full_path.startswith("docs") or full_path.startswith("openapi.json"):
                from fastapi import HTTPException
                raise HTTPException(status_code=404, detail="Not found")
            file_path = os.path.join(frontend_dist, full_path)
            if os.path.isfile(file_path):
                return FileResponse(file_path)
            return FileResponse(os.path.join(frontend_dist, "index.html"))

    return app


# Create the app instance
app = create_app()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
