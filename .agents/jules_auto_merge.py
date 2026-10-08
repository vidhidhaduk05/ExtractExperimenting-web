import urllib.request
import json
import time
import subprocess
import sys

sys.stdout.reconfigure(encoding='utf-8')

API_KEY = "AQ.Ab8RN6KpRDE0t3Zij8KVIm8jnloStXmx1UlzxjcMfcWLGYqKKg"
SESSIONS = {
    "backend": "5898143549150228709",
    "frontend": "2272339315693485275"
}

def get_session(session_id):
    url = f"https://jules.googleapis.com/v1alpha/sessions/{session_id}"
    req = urllib.request.Request(url, headers={"x-goog-api-key": API_KEY})
    return json.loads(urllib.request.urlopen(req).read())

def get_activities(session_id):
    url = f"https://jules.googleapis.com/v1alpha/sessions/{session_id}/activities"
    req = urllib.request.Request(url, headers={"x-goog-api-key": API_KEY})
    return json.loads(urllib.request.urlopen(req).read()).get("activities", [])

def approve_plan(session_id):
    url = f"https://jules.googleapis.com/v1alpha/sessions/{session_id}:approvePlan"
    req = urllib.request.Request(url, data=b"{}", headers={"x-goog-api-key": API_KEY, "Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())

def merge_pr_or_branch(branch_name):
    print(f"[*] Fetching and merging branch: {branch_name} into main...")
    subprocess.run(["git", "fetch", "origin"], check=True)
    subprocess.run(["git", "checkout", "main"], check=True)
    merge_proc = subprocess.run(["git", "merge", f"origin/{branch_name}", "--no-edit"], capture_output=True, text=True)
    if merge_proc.returncode == 0:
        print("[+] Merge successful! Pushing to origin main...")
        subprocess.run(["git", "push", "origin", "main"], check=True)
        print("[+] Graphify knowledge graph re-indexing...")
        subprocess.run(["python", "-m", "graphify", "--update"], check=False)
    else:
        print(f"[-] Merge encountered conflicts: {merge_proc.stderr}")

def monitor_loop():
    print("[*] Monitoring Jules sessions autonomously...")
    completed = set()
    while len(completed) < len(SESSIONS):
        for name, sid in SESSIONS.items():
            if sid in completed:
                continue
            try:
                s = get_session(sid)
                state = s.get("state")
                print(f"[{time.strftime('%H:%M:%S')}] {name} ({sid}) -> {state}")
                
                if state == "AWAITING_PLAN_APPROVAL":
                    print(f"[*] Auto-approving plan for {name} ({sid})...")
                    approve_plan(sid)
                elif state == "COMPLETED":
                    completed.add(sid)
                    pr = s.get("pullRequest")
                    branch = s.get("outputBranch") or s.get("branch")
                    print(f"[!] Session {name} COMPLETED! PR: {pr}, Output Branch: {branch}")
                    if branch and name == "backend":
                        merge_pr_or_branch(branch)
            except Exception as e:
                print(f"Error querying {sid}: {e}")
        time.sleep(25)

if __name__ == "__main__":
    monitor_loop()
