"""Background monitor for Google Jules autonomous sessions.

Periodically queries Jules REST API:
- GET /v1alpha/sessions/{id}
- GET /v1alpha/sessions/{id}/activities
Logs progress, detects plan approval needs, and auto-approves or reports PR completion.
"""
from __future__ import annotations

import json
import logging
import os
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("jules_monitor")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# Load .env from the same directory as this script
_env_path = Path(__file__).parent / ".env"
if _env_path.exists():
    for _line in _env_path.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip())

API_KEY = os.environ.get("JULES_API_KEY", "")
if not API_KEY:
    raise RuntimeError("JULES_API_KEY not set. Add it to .agents/.env")
BASE_URL = "https://jules.googleapis.com/v1alpha"


def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    url = f"{BASE_URL}/sessions/{session_id}"
    req = urllib.request.Request(url, headers={"x-goog-api-key": API_KEY})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        logger.error(f"Failed to fetch session {session_id}: {e}")
        return None


def get_activities(session_id: str) -> List[Dict[str, Any]]:
    url = f"{BASE_URL}/sessions/{session_id}/activities"
    req = urllib.request.Request(url, headers={"x-goog-api-key": API_KEY})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("activities", [])
    except Exception as e:
        logger.error(f"Failed to fetch activities for {session_id}: {e}")
        return []


def approve_plan(session_id: str) -> bool:
    url = f"{BASE_URL}/sessions/{session_id}:approvePlan"
    req = urllib.request.Request(
        url,
        data=b"{}",
        headers={"x-goog-api-key": API_KEY, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            logger.info(f"Approved plan for session {session_id}")
            return True
    except Exception as e:
        logger.error(f"Failed to approve plan for {session_id}: {e}")
        return False


def monitor_loop(session_ids: List[str], poll_interval_sec: int = 30):
    logger.info(f"Starting Jules background monitor for sessions: {session_ids}")
    seen_activity_ids = set()

    while True:
        all_done = True
        for session_id in session_ids:
            session = get_session(session_id)
            if not session:
                continue
            state = session.get("state", "UNKNOWN")
            title = session.get("title", "")[:40]
            logger.info(f"Session {session_id} [{title}] state: {state}")

            if state == "AWAITING_PLAN_APPROVAL":
                logger.info(f"Plan for session {session_id} requires approval. Auto-approving per rule...")
                approve_plan(session_id)
                all_done = False
            elif state in ("IN_PROGRESS", "QUEUED"):
                all_done = False
            elif state == "COMPLETED":
                logger.info(f"Session {session_id} COMPLETED. Inspecting generated artifacts...")
            elif state in ("FAILED", "CANCELLED"):
                logger.warning(f"Session {session_id} reached {state}.")

            activities = get_activities(session_id)
            for act in activities:
                act_id = act.get("name") or act.get("id") or str(act.get("createTime"))
                if act_id not in seen_activity_ids:
                    seen_activity_ids.add(act_id)
                    act_type = act.get("type", "activity")
                    desc = act.get("description") or act.get("thought") or act.get("message") or ""
                    logger.info(f"[{session_id}] New activity [{act_type}]: {desc[:120]}")

        if all_done:
            logger.info("All monitored sessions reached terminal states.")
            break

        time.sleep(poll_interval_sec)


if __name__ == "__main__":
    sids = sys.argv[1:] if len(sys.argv) > 1 else ["8414239125544510714", "6704673216573859865"]
    monitor_loop(sids)

