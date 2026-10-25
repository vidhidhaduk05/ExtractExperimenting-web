import shutil
from pathlib import Path

base = Path(r"d:\Desktop\Rad Extract Experimenting")

src_claimscape = base / "radextract_platform" / "frontend" / "src" / "pages" / "ClaimscapePage.tsx"
src_landing = base / "radextract_platform" / "frontend" / "src" / "pages" / "LandingPage.tsx"

targets = [
    base / "radextract_web_repo" / "src" / "pages" / "ClaimscapePage.tsx",
    base / "radextract_web_repo" / "radextract_platform" / "frontend" / "src" / "pages" / "ClaimscapePage.tsx",
    base / "radextract_web_repo" / "src" / "pages" / "LandingPage.tsx",
    base / "radextract_web_repo" / "radextract_platform" / "frontend" / "src" / "pages" / "LandingPage.tsx",
]

for t in targets[:2]:
    if t.parent.exists():
        shutil.copy2(src_claimscape, t)
        print(f"Copied ClaimscapePage.tsx to {t}")

for t in targets[2:]:
    if t.parent.exists():
        shutil.copy2(src_landing, t)
        print(f"Copied LandingPage.tsx to {t}")

print("Sync complete!")
