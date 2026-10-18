@echo off
if exist "%~dp0.venv\Scripts\python.exe" (
    "%~dp0.venv\Scripts\python.exe" "%~dp0dev-stop.py" %*
) else (
    python "%~dp0dev-stop.py" %*
)
