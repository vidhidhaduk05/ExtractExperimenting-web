import urllib.request
import json
from pathlib import Path

BASE_RAW_URL = "https://raw.githubusercontent.com/vidhidhaduk05/ExtractExperimenting-web/gh-pages"
TARGET_DIR = Path(__file__).resolve().parent / "radextract_platform" / "frontend" / "dist"
TARGET_DIR.mkdir(parents=True, exist_ok=True)

# Fetch tree from GitHub API
tree_url = "https://api.github.com/repos/vidhidhaduk05/ExtractExperimenting-web/git/trees/gh-pages?recursive=1"
req = urllib.request.Request(tree_url, headers={"User-Agent": "Mozilla/5.0"})

try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        blobs = [item["path"] for item in data.get("tree", []) if item["type"] == "blob"]
except Exception as e:
    print(f"Error fetching tree: {e}")
    blobs = ["index.html", "404.html", ".nojekyll", "assets/index-BvYYFw83.css", "assets/index-DvEGvmsV.js"]

print(f"Synchronizing {len(blobs)} files into {TARGET_DIR}...")
for rel_path in blobs:
    if rel_path.startswith("papers/"):
        continue  # Skip large sample PDFs locally
    dest = TARGET_DIR / rel_path
    dest.parent.mkdir(parents=True, exist_ok=True)
    raw_url = f"{BASE_RAW_URL}/{rel_path}"
    try:
        r = urllib.request.Request(raw_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(r) as resp:
            content = resp.read()
            dest.write_bytes(content)
            print(f"  [OK] {rel_path} ({len(content)} bytes)")
    except Exception as e:
        print(f"  [ERR] {rel_path}: {e}")

print("Local dist bundle updated successfully!")
