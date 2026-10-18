import urllib.request
import json
import zipfile
import io

url = "https://api.github.com/repos/vidhidhaduk05/ExtractExperimenting-web/actions/runs/39148176973/logs"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req, timeout=15) as r:
        zip_data = r.read()
        print(f"Downloaded logs zip: {len(zip_data)} bytes")
        with zipfile.ZipFile(io.BytesIO(zip_data)) as z:
            for name in z.namelist():
                if "deploy" in name.lower() or "build" in name.lower() or "frontend" in name.lower():
                    print("Log file:", name)
                    content = z.read(name).decode('utf-8', errors='replace')
                    lines = content.splitlines()
                    for line in lines[-50:]:
                        print(" ", line)
except Exception as e:
    print('Error fetching logs:', e)
