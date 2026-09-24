#!/usr/bin/env python3
"""Stop any running VDExtract services by port (8000, 8081, 5173, 4566)."""
import os
import subprocess
import sys


def kill_port(port: int):
    if os.name == "nt":
        cmd = f'powershell -Command "Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue | ForEach-Object {{ Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }}"'
        subprocess.run(cmd, shell=True)
    else:
        subprocess.run(f"lsof -ti:{port} | xargs kill -9", shell=True)
    print(f"Cleared port {port}")


if __name__ == "__main__":
    print("Stopping VDExtract services...")
    for p in [8000, 8081, 5173, 4566]:
        kill_port(p)
    print("All services stopped.")
