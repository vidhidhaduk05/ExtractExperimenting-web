#!/usr/bin/env python3
"""Start all VDExtract services for local development (no Docker)."""
import os
import sys
import time
import signal
import subprocess
import shutil

PROCESSES = []
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))


def start_localstack():
    """Start LocalStack in host mode if available."""
    localstack_cmd = shutil.which("localstack")
    if localstack_cmd:
        try:
            print("[Dev] Starting LocalStack in host mode...")
            p = subprocess.Popen(
                [localstack_cmd, "start", "--host", "-p", "4566"],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
            )
            PROCESSES.append(("localstack", p))
            time.sleep(4)
            # Initialize S3 buckets and DynamoDB tables against LocalStack
            subprocess.run(
                [sys.executable, "-m", "scripts.init_aws_local"],
                cwd=os.path.join(ROOT_DIR, "radextract_platform", "backend"),
            )
        except Exception as e:
            print(f"[Dev] LocalStack start note: {e}")
    else:
        print("[Dev] LocalStack CLI not found on PATH. Using native SQLite/local storage fallback.")


def start_llm_gateway():
    """Check for local Biomni or gemini-web2api LLM gateway."""
    gateway_dir = os.path.join(ROOT_DIR, "gemini-web2api-main")
    if os.path.exists(os.path.join(gateway_dir, "gemini_web2api.py")):
        print("[Dev] Starting gemini-web2api gateway...")
        p = subprocess.Popen(
            [sys.executable, "gemini_web2api.py"],
            cwd=gateway_dir,
        )
        PROCESSES.append(("llm-gateway", p))
    else:
        import socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        result = sock.connect_ex(('127.0.0.1', 18000))
        sock.close()
        if result == 0:
            print("[Dev] Detected active Biomni-R0 model server on http://127.0.0.1:18000 (using key sk-biomni-...)")
        else:
            print("[Dev] Note: Biomni model server not detected on port 18000.")


def start_backend():
    """Start FastAPI backend."""
    env = os.environ.copy()
    env.update({
        "RADEXTRACT_ENV": "development",
        "RADEXTRACT_DB_BACKEND": os.getenv("RADEXTRACT_DB_BACKEND", "sqlite"),
        "RADEXTRACT_STORAGE_BACKEND": os.getenv("RADEXTRACT_STORAGE_BACKEND", "local"),
        "RADEXTRACT_AWS_ENDPOINT_URL": os.getenv("RADEXTRACT_AWS_ENDPOINT_URL", "http://localhost:4566"),
        "RADEXTRACT_AWS_REGION": "us-east-1",
        "RADEXTRACT_AWS_ACCESS_KEY_ID": "test",
        "RADEXTRACT_AWS_SECRET_ACCESS_KEY": "test",
        "RADEXTRACT_LLM_API_URL": os.getenv("RADEXTRACT_LLM_API_URL", "http://127.0.0.1:18000/v1/chat/completions"),
        "RADEXTRACT_LLM_MODELS_URL": os.getenv("RADEXTRACT_LLM_MODELS_URL", "http://127.0.0.1:18000/v1/models"),
        "RADEXTRACT_LLM_API_KEY": os.getenv("RADEXTRACT_LLM_API_KEY", "sk-biomni-4f8a29b3c1e7492d80ef7195a62bc34e"),
        "RADEXTRACT_LLM_MODEL": os.getenv("RADEXTRACT_LLM_MODEL", "biomni-r0"),
    })
    backend_dir = os.path.join(ROOT_DIR, "radextract_platform", "backend")
    print("[Dev] Starting FastAPI backend on http://localhost:8000 ...")
    p = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "main:app",
            "--reload",
            "--host",
            "0.0.0.0",
            "--port",
            "8000",
        ],
        cwd=backend_dir,
        env=env,
    )
    PROCESSES.append(("backend", p))


def start_frontend():
    """Start Vite dev server."""
    frontend_dir = os.path.join(ROOT_DIR, "radextract_platform", "frontend")
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    if shutil.which(npm_cmd) or shutil.which("npm"):
        print("[Dev] Starting Vite frontend on http://localhost:5173 ...")
        cmd = npm_cmd if shutil.which(npm_cmd) else "npm"
        p = subprocess.Popen([cmd, "run", "dev"], cwd=frontend_dir, shell=(os.name == "nt"))
        PROCESSES.append(("frontend", p))
    else:
        print("[Dev] npm not found on PATH.")


def cleanup(*args):
    print("\n[Dev] Stopping all services...")
    for name, p in PROCESSES:
        try:
            p.terminate()
            p.wait(timeout=2)
        except Exception:
            try:
                p.kill()
            except Exception:
                pass
    sys.exit(0)


if __name__ == "__main__":
    signal.signal(signal.SIGINT, cleanup)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, cleanup)

    print("=" * 60)
    print("  VDExtract Local Development Environment (No Docker)")
    print("=" * 60)

    start_localstack()
    start_llm_gateway()
    time.sleep(1)
    start_backend()
    time.sleep(1)
    start_frontend()

    print("\n" + "=" * 60)
    print("Services status:")
    print("  - Backend API: http://localhost:8000/docs")
    print("  - Health Check: http://localhost:8000/api/health")
    print("  - LLM Server (Biomni-R0): http://127.0.0.1:18000/v1 (model: biomni-r0)")
    print("  - Frontend UI: http://localhost:5173")
    print("=" * 60)
    print("Press Ctrl+C to stop all services.\n")

    try:
        for name, p in PROCESSES:
            p.wait()
    except KeyboardInterrupt:
        cleanup()
