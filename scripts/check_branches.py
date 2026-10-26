import subprocess
from pathlib import Path

WEB_REPO_DIR = Path(r"d:\Desktop\Rad Extract Experimenting\radextract_web_repo")

res = subprocess.run(["git", "branch", "-r", "--no-merged", "main"], cwd=WEB_REPO_DIR, capture_output=True, text=True, errors="replace")
branches = [b.strip() for b in res.stdout.splitlines() if b.strip() and not b.strip().endswith("gh-pages") and not b.strip().endswith("main") and not "HEAD" in b]

related = []
unrelated = []

for b in branches:
    mb = subprocess.run(["git", "merge-base", "main", b], cwd=WEB_REPO_DIR, capture_output=True, text=True)
    if mb.returncode == 0 and mb.stdout.strip():
        related.append(b)
    else:
        unrelated.append(b)

print(f"Total unmerged: {len(branches)}")
print(f"Related branches ({len(related)}):")
for r in related[:10]:
    print(f"  {r}")
print(f"Unrelated branches ({len(unrelated)}):")
for u in unrelated:
    print(f"  {u}")
