"""Background monitor for Google Jules autonomous sessions.

Periodically queries Jules REST API:
- GET /v1alpha/sessions/{id}
- GET /v1alpha/sessions/{id}/activities
Logs progress, detects plan approval needs, and auto-approves or reports PR completion.
"""
from __future__ import annotations

import json
import logging
import sys
import time
import urllib.request
from typing import Any, Dict, List, Optional

logger = logging.getLogger("jules_monitor")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

API_KEY = "AQ.Ab8RN6KpRDE0t3Zij8KVIm8jnloStXmx1UlzxjcMfcWLGYqKKg"
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


def monitor_loop(session_id: str, poll_interval_sec: int = 30):
    logger.info(f"Starting Jules background monitor for session {session_id}")
    seen_activity_ids = set()

    while True:
        session = get_session(session_id)
        if session:
            state = session.get("state", "UNKNOWN")
            logger.info(f"Session {session_id} state: {state}")

            if state == "AWAITING_PLAN_APPROVAL":
                logger.info("Plan requires approval. Auto-approving per rule...")
                approve_plan(session_id)
            elif state in ("COMPLETED", "FAILED", "CANCELLED"):
                logger.info(f"Session reached terminal state: {state}")
                break

        activities = get_activities(session_id)
        for act in activities:
            act_id = act.get("name") or act.get("id") or str(act.get("createTime"))
            if act_id not in seen_activity_ids:
                seen_activity_ids.add(act_id)
                act_type = act.get("type", "activity")
                desc = act.get("description") or act.get("thought") or act.get("message") or ""
                logger.info(f"New activity [{act_type}]: {desc[:120]}")

        time.sleep(poll_interval_sec)


if __name__ == "__main__":
    sid = sys.argv[1] if len(sys.argv) > 1 else "8414239125544510714"
    monitor_loop(sid)
