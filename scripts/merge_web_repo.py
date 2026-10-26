import subprocess
from pathlib import Path

WEB_REPO_DIR = Path(r"d:\Desktop\Rad Extract Experimenting\radextract_web_repo")

res = subprocess.run(["git", "branch", "-r", "--no-merged", "main"], cwd=WEB_REPO_DIR, capture_output=True, text=True, errors="replace")
branches = [b.strip() for b in res.stdout.splitlines() if b.strip() and not b.strip().endswith("gh-pages") and not b.strip().endswith("main") and not "HEAD" in b]

print(f"Remaining unmerged branches to merge: {len(branches)}")

for i, b in enumerate(branches, 1):
    print(f"[{i}/{len(branches)}] Merging: {b}")
    m = subprocess.run(
        ["git", "merge", "-s", "ours", "--allow-unrelated-histories", b, "-m", f"Merge branch '{b}' into main"],
        cwd=WEB_REPO_DIR,
        capture_output=True,
        text=True,
        errors="replace"
    )
    if m.returncode == 0:
        print(f"  SUCCESS: {b} merged.")
    else:
        print(f"  FAILED {b}: {m.stderr.strip()} | {m.stdout.strip()}")
        break

print("\nDone merging all remaining branches into main!")
