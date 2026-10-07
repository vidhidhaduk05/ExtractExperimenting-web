# syntax=docker/dockerfile:1
FROM python:3.11-slim

LABEL maintainer="RadExtract Platform Team"
LABEL description="RadExtract Systematic Review Platform Backend API"

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    RADEXTRACT_DB_PATH=/data/db/radextract.db \
    RADEXTRACT_UPLOAD_ROOT=/data/pdfs \
    RADEXTRACT_EXPORT_ROOT=/data/exports

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create volume directories
RUN mkdir -p /data/db /data/pdfs /data/exports

# Copy application source
COPY . .

# Expose FastAPI port
EXPOSE 8000

# Container healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Start production server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
