@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
cls

echo ======================================================================
echo    RadExtract Web App: Synchronize and Publish to GitHub Pages
echo    Target:   https://github.com/vidhidhaduk05/ExtractExperimenting-web
echo    Live URL: https://vidhidhaduk05.github.io/ExtractExperimenting-web/
echo ======================================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "PYTHON_EXE=%SCRIPT_DIR%.venv\Scripts\python.exe"

if exist "%PYTHON_EXE%" (
    echo [INFO] Running automated sync and deployment via Python engine...
    "%PYTHON_EXE%" "%SCRIPT_DIR%sync_web_repo.py" %*
) else (
    echo [INFO] Python venv not found. Running native Git push...
    cd /d "%SCRIPT_DIR%radextract_web_repo"
    git add -A
    git commit -m "deploy: update web application for github pages"
    git push -u origin main --force
)

if %ERRORLEVEL% equ 0 (
    echo.
    echo ======================================================================
    echo  [SUCCESS] Web App successfully pushed to GitHub!
    echo  Check GitHub Actions build and deployment status at:
    echo  https://github.com/vidhidhaduk05/ExtractExperimenting-web/actions
    echo.
    echo  Live GitHub Pages will deploy at:
    echo  https://vidhidhaduk05.github.io/ExtractExperimenting-web/
    echo ======================================================================
) else (
    echo.
    echo ======================================================================
    echo  [ERROR] Push failed with exit code %ERRORLEVEL%.
    echo  Please check your internet connection or Git credentials.
    echo ======================================================================
)

echo.
pause

