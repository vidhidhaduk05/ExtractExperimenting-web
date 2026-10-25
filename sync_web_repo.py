"""
RadExtract Web Repo Synchronizer and GitHub Pages Deployer.
Automatically synchronizes frontend sources from the main repository into
radextract_web_repo and pushes to github.com/vidhidhaduk05/ExtractExperimenting-web.
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
SRC_FRONTEND = ROOT_DIR / "radextract_platform" / "frontend"
WEB_REPO_DIR = ROOT_DIR / "radextract_web_repo"
DEST_PLATFORM_FRONTEND = WEB_REPO_DIR / "radextract_platform" / "frontend"
DEST_ROOT_SRC = WEB_REPO_DIR / "src"

IGNORE_PATTERNS = shutil.ignore_patterns(
    "node_modules",
    "dist",
    ".git",
    "*.pyc",
    "__pycache__",
    ".pytest_cache",
    ".vite",
    ".deploy_gh_pages",
)


def sync_directory(src: Path, dst: Path):
    """Recursively copy files from src to dst, replacing newer/modified files."""
    if not src.exists():
        print(f"[WARN] Source directory does not exist: {src}")
        return

    dst.mkdir(parents=True, exist_ok=True)
    count = 0

    for root, dirs, files in os.walk(src):
        # Exclude ignored dirs in-place
        dirs[:] = [d for d in dirs if d not in {"node_modules", "dist", ".git", "__pycache__", ".vite"}]
        rel_path = Path(root).relative_to(src)
        target_dir = dst / rel_path
        target_dir.mkdir(parents=True, exist_ok=True)

        for f in files:
            src_file = Path(root) / f
            dst_file = target_dir / f

            # Copy if missing or modified
            if not dst_file.exists() or src_file.stat().st_mtime > dst_file.stat().st_mtime or src_file.stat().st_size != dst_file.stat().st_size:
                shutil.copy2(src_file, dst_file)
                count += 1

    print(f"  -> Synced {count} files to {dst.relative_to(ROOT_DIR) if dst.is_relative_to(ROOT_DIR) else dst}")


def ensure_github_pages_workflow():
    """Ensure deploy-pages.yml workflow is present and up to date."""
    workflows_dir = WEB_REPO_DIR / ".github" / "workflows"
    workflows_dir.mkdir(parents=True, exist_ok=True)
    workflow_path = workflows_dir / "deploy-pages.yml"

    content = """name: Deploy Web App to GitHub Pages

on:
  push:
    branches: [ main ]
  workflow_dispatch:

permissions:
  contents: write
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: "npm"
          cache-dependency-path: radextract_platform/frontend/package-lock.json

      - name: Install Frontend Dependencies
        working-directory: radextract_platform/frontend
        run: npm install --legacy-peer-deps

      - name: Build Production Web App
        working-directory: radextract_platform/frontend
        run: |
          npm run build
          cp dist/index.html dist/404.html 2>/dev/null || true

      - name: Deploy to gh-pages branch (Direct Branch Publishing)
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: radextract_platform/frontend/dist
          publish_branch: gh-pages
          force_orphan: true

      - name: Setup Pages
        uses: actions/configure-pages@v5
        continue-on-error: true

      - name: Upload Pages Artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: radextract_platform/frontend/dist
        continue-on-error: true

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
        continue-on-error: true
"""
    workflow_path.write_text(content, encoding="utf-8")
    print("  -> Verified .github/workflows/deploy-pages.yml")


def ensure_vite_config():
    """Ensure vite.config.ts in radextract_platform/frontend has relative base."""
    target_config = DEST_PLATFORM_FRONTEND / "vite.config.ts"
    if target_config.exists():
        text = target_config.read_text(encoding="utf-8")
        if "base:" not in text:
            # Add base: './'
            new_text = text.replace("plugins: [react()],", "plugins: [react()],\n  base: './',")
            target_config.write_text(new_text, encoding="utf-8")
            print("  -> Added base: './' to radextract_platform/frontend/vite.config.ts")

    root_config = WEB_REPO_DIR / "vite.config.ts"
    if root_config.exists():
        text = root_config.read_text(encoding="utf-8")
        if "base:" not in text:
            new_text = text.replace("plugins: [react()],", "plugins: [react()],\n  base: './',")
            root_config.write_text(new_text, encoding="utf-8")
            print("  -> Added base: './' to root vite.config.ts")


def run_git(args: list[str], cwd: Path) -> subprocess.CompletedProcess:
    """Execute a git command with error handling."""
    cmd = ["git"] + args
    return subprocess.run(
        cmd,
        cwd=str(cwd),
        capture_output=True,
        text=True,
        check=False,
    )


def main():
    print("=" * 68)
    print("  RadExtract Web App: Sync & Publish to GitHub Pages")
    print("  Remote:   https://github.com/vidhidhaduk05/ExtractExperimenting-web")
    print("  Live URL: https://vidhidhaduk05.github.io/ExtractExperimenting-web/")
    print("=" * 68)
    print()

    # Step 1: Sync files from main repo to web repo
    print("[1/4] Synchronizing frontend sources from main workspace...")
    sync_directory(SRC_FRONTEND, DEST_PLATFORM_FRONTEND)
    sync_directory(SRC_FRONTEND / "src", DEST_ROOT_SRC)

    # Step 2: Ensure GitHub Pages configuration
    print("\n[2/4] Verifying GitHub Pages workflow & Vite configurations...")
    ensure_github_pages_workflow()
    ensure_vite_config()

    # Step 3: Git stage & commit
    print("\n[3/4] Checking Git staging in radextract_web_repo...")
    run_git(["config", "core.longpaths", "true"], WEB_REPO_DIR)
    run_git(["add", "-A"], WEB_REPO_DIR)

    # Check if there are staged changes using porcelain status
    status_proc = run_git(["status", "--porcelain"], WEB_REPO_DIR)
    has_staged = False
    for line in status_proc.stdout.splitlines():
        if len(line) >= 2 and line[0] in "AMDRC":
            has_staged = True
            break

    if has_staged:
        print("  -> New changes detected. Committing...")
        commit_res = run_git(
            ["commit", "-m", "feat: complete RadExtract web app with Evidence Map, Rigor Scan, and Citation Telephone"],
            WEB_REPO_DIR,
        )
        print(f"  -> {commit_res.stdout.strip()}")
    else:
        print("  -> Working tree clean, no new uncommitted changes.")

    # Step 4: Git push
    print("\n[4/4] Pushing to origin/main (https://github.com/vidhidhaduk05/ExtractExperimenting-web)...")
    push_res = run_git(["-c", "http.sslVerify=false", "push", "-u", "origin", "main", "--force"], WEB_REPO_DIR)

    if push_res.returncode == 0:
        print("\n" + "=" * 68)
        print("  [SUCCESS] Pushed successfully to origin/main!")
        print("  View GitHub Actions deployment status:")
        print("  https://github.com/vidhidhaduk05/ExtractExperimenting-web/actions")
        print()
        print("  Live GitHub Pages URL:")
        print("  https://vidhidhaduk05.github.io/ExtractExperimenting-web/")
        print("=" * 68)
        return 0
    else:
        print(f"\n[ERROR] git push failed:\n{push_res.stderr}")
        return push_res.returncode


if __name__ == "__main__":
    sys.exit(main())
