#!/usr/bin/env python3
"""
HPC Continuous Shift & Auto-Troubleshooting Notifier
Sends notifications to vidhidhaduk05@gmail.com for:
1. Shift Start (new 24-hour job spin-up)
2. Shift Handover Success (1-hour overlap completed, traffic shifted)
3. Auto-Troubleshoot Recovery (self-healing triggered & fixed)
4. Shift End (graceful decommissioning of previous job)
"""

from __future__ import annotations

import os
import sys
import socket
import datetime
import smtplib
import subprocess
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, Dict, Any

RECIPIENT_EMAIL = "vidhidhaduk05@gmail.com"
SENDER_EMAIL = f"radextract-hpc@{socket.getfqdn()}"


def send_email(subject: str, text_content: str, html_content: Optional[str] = None) -> bool:
    """Send an email using localhost SMTP with fallback to /usr/sbin/sendmail."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"RadExtract HPC Monitor <{SENDER_EMAIL}>"
    msg["To"] = RECIPIENT_EMAIL
    msg["Date"] = datetime.datetime.now(datetime.timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")

    part1 = MIMEText(text_content, "plain")
    msg.attach(part1)
    if html_content:
        part2 = MIMEText(html_content, "html")
        msg.attach(part2)

    # Method 1: Localhost SMTP (port 25)
    try:
        with smtplib.SMTP("localhost", 25, timeout=10) as server:
            server.sendmail(SENDER_EMAIL, [RECIPIENT_EMAIL], msg.as_string())
        print(f"[Notifier] Email sent via SMTP to {RECIPIENT_EMAIL}: {subject}")
        return True
    except Exception as e_smtp:
        print(f"[Notifier] SMTP port 25 failed ({e_smtp}), trying sendmail pipe...")

    # Method 2: /usr/sbin/sendmail
    if os.path.exists("/usr/sbin/sendmail"):
        try:
            p = subprocess.Popen(
                ["/usr/sbin/sendmail", "-t", "-oi"],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            stdout, stderr = p.communicate(msg.as_string(), timeout=15)
            if p.returncode == 0:
                print(f"[Notifier] Email sent via /usr/sbin/sendmail to {RECIPIENT_EMAIL}: {subject}")
                return True
            else:
                print(f"[Notifier] sendmail returned {p.returncode}: {stderr}")
        except Exception as e_sm:
            print(f"[Notifier] sendmail execution failed: {e_sm}")

    # Method 3: /usr/bin/mail
    if os.path.exists("/usr/bin/mail"):
        try:
            p = subprocess.Popen(
                ["/usr/bin/mail", "-s", subject, RECIPIENT_EMAIL],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            stdout, stderr = p.communicate(text_content, timeout=15)
            if p.returncode == 0:
                print(f"[Notifier] Email sent via /usr/bin/mail to {RECIPIENT_EMAIL}")
                return True
        except Exception as e_mail:
            print(f"[Notifier] /usr/bin/mail failed: {e_mail}")

    print("[-] All email delivery methods failed.")
    return False


def build_status_card(title: str, color: str, items: Dict[str, Any]) -> str:
    """Build a styled HTML card for email body."""
    rows = "".join(
        f"<tr><td style='padding:6px 12px;font-weight:600;color:#475569;border-bottom:1px solid #f1f5f9;'>{k}</td>"
        f"<td style='padding:6px 12px;color:#0f172a;font-family:monospace;border-bottom:1px solid #f1f5f9;'>{v}</td></tr>"
        for k, v in items.items()
    )
    return f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
        <div style="background:{color};color:white;padding:16px 20px;">
            <h2 style="margin:0;font-size:18px;font-weight:700;">{title}</h2>
            <div style="font-size:12px;opacity:0.9;margin-top:4px;">WVU CTSI HPC Cluster • Autonomous Job Scheduler</div>
        </div>
        <div style="padding:20px;background:#ffffff;">
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
                {rows}
            </table>
        </div>
        <div style="background:#f8fafc;padding:12px 20px;font-size:12px;color:#64748b;text-align:center;border-top:1px solid #e2e8f0;">
            RadExtract Autonomous 24/7 Engine • Zero-Downtime Shift Handover System
        </div>
    </div>
    """


def notify_shift_started(job_id: str, node_name: str, walltime_hours: int = 24, public_url: str = "") -> bool:
    subject = f"🟢 [RadExtract HPC] Shift Started - Job #{job_id} on {node_name}"
    items = {
        "Event": "New 24-Hour Job Spin-Up",
        "Slurm Job ID": job_id,
        "Compute Node": node_name,
        "Allocated Walltime": f"{walltime_hours} Hours",
        "Overlap Schedule": "Next shift starts at Hour 23 (1h zero-downtime overlap)",
        "Timestamp (UTC)": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "Public Gateway": f"<a href='{public_url}'>{public_url}</a>" if public_url else "Initializing...",
    }
    text = (
        f"RadExtract HPC Shift Started\n"
        f"-----------------------------\n"
        f"Job ID: {job_id}\n"
        f"Node: {node_name}\n"
        f"Walltime: {walltime_hours} Hours\n"
        f"Next Overlap Shift: Triggering at Hour 23:00\n"
        f"Public Gateway: {public_url}\n"
        f"Time: {items['Timestamp (UTC)']}\n"
    )
    html = build_status_card("🟢 Shift Started: 24-Hour Allocation Active", "#0284c7", items)
    return send_email(subject, text, html)


def notify_shift_handover_success(
    old_job_id: str, new_job_id: str, new_node: str, public_url: str, overlap_minutes: int = 60
) -> bool:
    subject = f"✅ [RadExtract HPC] Shift Handover SUCCESSFUL: Job #{old_job_id} ➔ #{new_job_id}"
    items = {
        "Status": "ZERO-DOWNTIME SHIFT HANDOVER COMPLETE",
        "Outgoing Shift": f"Job #{old_job_id} (retiring after WAL flush)",
        "Incoming Shift": f"Job #{new_job_id} (active)",
        "Active Node": new_node,
        "Overlap Duration": f"{overlap_minutes} Minutes",
        "Tier 1 Biomni-R0 (18000)": "Verified Online & Healthy",
        "Tier 2 FastAPI (8000)": "Verified Online & Healthy",
        "Tier 3 Public Ingress": f"<a href='{public_url}'>{public_url}</a>",
        "Timestamp (UTC)": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
    }
    text = (
        f"RadExtract HPC Shift Handover SUCCESSFUL\n"
        f"----------------------------------------\n"
        f"Outgoing Job: {old_job_id}\n"
        f"Incoming Job: {new_job_id} on {new_node}\n"
        f"Overlap Window: {overlap_minutes} mins\n"
        f"Services: Tier 1 (Biomni-R0), Tier 2 (FastAPI), Tier 3 (Cloudflare) VERIFIED HEALTHY\n"
        f"Live Gateway: {public_url}\n"
        f"Time: {items['Timestamp (UTC)']}\n"
    )
    html = build_status_card("✅ Shift Handover Successful: 0-Downtime Transition", "#059669", items)
    return send_email(subject, text, html)


def notify_shift_ended(job_id: str, node_name: str, exit_reason: str = "Completed 24-hour cycle cleanly") -> bool:
    subject = f"🏁 [RadExtract HPC] Shift Concluded - Job #{job_id} on {node_name}"
    items = {
        "Event": "Shift Successfully Retired",
        "Slurm Job ID": job_id,
        "Compute Node": node_name,
        "Status": exit_reason,
        "Database Sync": "Scratch SQLite flushed & synced to persistent NFS",
        "Timestamp (UTC)": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
    }
    text = (
        f"RadExtract HPC Shift Concluded\n"
        f"------------------------------\n"
        f"Job ID: {job_id}\n"
        f"Node: {node_name}\n"
        f"Status: {exit_reason}\n"
        f"Database Sync: Scratch WAL synced back to persistent storage.\n"
        f"Time: {items['Timestamp (UTC)']}\n"
    )
    html = build_status_card("🏁 Shift Concluded Gracefully", "#475569", items)
    return send_email(subject, text, html)


def notify_troubleshoot_event(
    component: str, issue: str, resolution: str, status: str = "RESOLVED", job_id: str = ""
) -> bool:
    subject = f"⚠️ [RadExtract HPC Auto-Troubleshoot] {status}: {component}"
    color = "#10b981" if status == "RESOLVED" else "#ef4444"
    items = {
        "Incident Type": "Automated Self-Healing Watchdog",
        "Component": component,
        "Issue Detected": issue,
        "Auto-Action Taken": resolution,
        "Current Status": status,
        "Slurm Job ID": job_id or os.environ.get("SLURM_JOB_ID", "local"),
        "Host Node": socket.gethostname(),
        "Timestamp (UTC)": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
    }
    text = (
        f"RadExtract HPC Auto-Troubleshoot Alert\n"
        f"-------------------------------------\n"
        f"Component: {component}\n"
        f"Issue: {issue}\n"
        f"Action: {resolution}\n"
        f"Status: {status}\n"
        f"Node: {items['Host Node']}\n"
        f"Time: {items['Timestamp (UTC)']}\n"
    )
    html = build_status_card(f"🔧 Auto-Troubleshooting Alert: {status}", color, items)
    return send_email(subject, text, html)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="RadExtract HPC Continuous Shift Notifier")
    parser.add_argument("positional_action", nargs="?", default=None, help="Action: test, start, handover, end, troubleshoot")
    parser.add_argument("--event", "--action", dest="flag_action", default=None, help="Action name")
    parser.add_argument("args", nargs="*", help="Positional arguments for action")
    parser.add_argument("--job", dest="job", default=None)
    parser.add_argument("--node", dest="node", default=None)
    parser.add_argument("--url", dest="url", default=None)
    parser.add_argument("--details", dest="details", default=None)
    parser.add_argument("--status", dest="status", default="RESOLVED")

    parsed, unknown = parser.parse_known_args()
    action = (parsed.flag_action or parsed.positional_action or "").lower().strip()

    if not action and len(sys.argv) > 1:
        first = sys.argv[1].lower().strip()
        if not first.startswith("-"):
            action = first

    if action == "test":
        print(f"[Notifier] Sending test notification to {RECIPIENT_EMAIL}...")
        details = parsed.details or (parsed.args[0] if parsed.args else "Test notification confirming scheduler alert channel.")
        ok = send_email(
            "🧪 [RadExtract HPC] Test Notification",
            f"This is a test notification confirming that the automated scheduler email system is working.\n\nDetails: {details}",
            build_status_card(
                "🧪 Scheduler Email Test",
                "#6366f1",
                {
                    "Recipient": RECIPIENT_EMAIL,
                    "Status": "System Ready",
                    "Cluster": "WVU CTSI HPC (ctsi-hpc.hsc.wvu.edu)",
                    "Node": socket.gethostname(),
                    "Details": details,
                },
            ),
        )
        sys.exit(0 if ok else 1)
    elif action == "start":
        job = parsed.job or (parsed.args[0] if len(parsed.args) > 0 else os.environ.get("SLURM_JOB_ID", "local"))
        node = parsed.node or (parsed.args[1] if len(parsed.args) > 1 else socket.gethostname())
        url = parsed.url or (parsed.args[2] if len(parsed.args) > 2 else "")
        ok = notify_shift_started(job, node, 24, url)
        sys.exit(0 if ok else 1)
    elif action == "handover":
        old_j = parsed.args[0] if len(parsed.args) > 0 else "previous"
        new_j = parsed.job or (parsed.args[1] if len(parsed.args) > 1 else os.environ.get("SLURM_JOB_ID", "current"))
        node = parsed.node or (parsed.args[2] if len(parsed.args) > 2 else socket.gethostname())
        url = parsed.url or (parsed.args[3] if len(parsed.args) > 3 else "")
        ok = notify_shift_handover_success(old_j, new_j, node, url)
        sys.exit(0 if ok else 1)
    elif action == "end":
        job = parsed.job or (parsed.args[0] if len(parsed.args) > 0 else os.environ.get("SLURM_JOB_ID", "local"))
        node = parsed.node or (parsed.args[1] if len(parsed.args) > 1 else socket.gethostname())
        reason = parsed.details or (parsed.args[2] if len(parsed.args) > 2 else "Completed 24-hour cycle cleanly")
        ok = notify_shift_ended(job, node, reason)
        sys.exit(0 if ok else 1)
    elif action == "troubleshoot":
        comp = parsed.args[0] if len(parsed.args) > 0 else "Service"
        issue = parsed.args[1] if len(parsed.args) > 1 else "Unresponsive"
        action_desc = parsed.details or (parsed.args[2] if len(parsed.args) > 2 else "Restarted")
        status = parsed.status or (parsed.args[3] if len(parsed.args) > 3 else "RESOLVED")
        ok = notify_troubleshoot_event(comp, issue, action_desc, status)
        sys.exit(0 if ok else 1)
    else:
        print(f"Unknown action: '{action}'. Usage: hpc_notifier.py [test|start|handover|end|troubleshoot]")
        sys.exit(1)
