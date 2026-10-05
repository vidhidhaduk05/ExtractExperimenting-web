@echo off
echo ===================================================
echo Pushing Web App to github.com/vidhidhaduk05/ExtractExperimenting-web
echo ===================================================
cd /d "d:\Desktop\Rad Extract Experimenting\radextract_web_repo"
git push -u origin main
if %ERRORLEVEL% equ 0 (
    echo.
    echo [SUCCESS] Web App successfully pushed!
    echo Check GitHub Actions at: https://github.com/vidhidhaduk05/ExtractExperimenting-web/actions
    echo Live Pages will deploy at: https://vidhidhaduk05.github.io/ExtractExperimenting-web/
) else (
    echo.
    echo [FAILED] Repository may not have been created yet on GitHub.
    echo Please make sure you created the empty PUBLIC repo at: https://github.com/new
)
pause
