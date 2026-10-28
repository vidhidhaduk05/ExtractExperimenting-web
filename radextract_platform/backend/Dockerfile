# RadExtract backend — production container (Render / Fly.io / Railway)
FROM python:3.11-slim

# System deps: none needed beyond stdlib for the current requirements
# (pdfplumber/pymupdf/onnxruntime ship wheels; no compiled system libs required)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install dependencies first for layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code
COPY . .

# Data directory for the persistent disk/volume:
#   /data/database/radextract.db  (SQLite)
#   /data/storage/PROJECTS/...    (STUDY DATA tree: PDFs, exports, criteria)
# These are overridden by env vars at deploy time and must be mounted.
RUN mkdir -p /data/database /data/storage

EXPOSE 8000

# Health check hits the app's own /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
