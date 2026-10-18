import urllib.request
import json

req = urllib.request.Request(
    'https://api.github.com/repos/vidhidhaduk05/ExtractExperimenting-web/actions/runs',
    headers={'User-Agent': 'Mozilla/5.0'}
)
try:
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.loads(r.read())
        runs = data.get('workflow_runs', [])
        print(f"Total runs: {len(runs)}")
        for run in runs[:5]:
            print(f"{run.get('name')} | status: {run.get('status')} | conclusion: {run.get('conclusion')} | commit: {run.get('head_commit', {}).get('message', '')[:40]} | {run.get('html_url')}")
except Exception as e:
    print('Error:', e)
