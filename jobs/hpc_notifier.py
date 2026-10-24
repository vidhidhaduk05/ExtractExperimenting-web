#!/usr/bin/env python3
"""
HPC Continuous Shift Notifier
Directly alerts vidhidhaduk05@gmail.com via WVU SMTP relay (smtp.wvu.edu:25).
Concise, short alerts with subjects:
  - shift manager - start
  - shift manager - shifting
  - shift manager - success
  - shift manager - failure
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
from typing import Optional

RECIPIENT_EMAIL = "vidhidhaduk05@gmail.com"
SENDER_EMAIL = "vd00026@hsc.wvu.edu"
WVU_SMTP_HOST = "smtp.wvu.edu"


def send_email(subject: str, text_content: str, html_content: Optional[str] = None) -> bool:
    """Send an email using smtp.wvu.edu:25, fallback to localhost:25, then /usr/sbin/sendmail."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"Shift Manager <{SENDER_EMAIL}>"
    msg["To"] = RECIPIENT_EMAIL
    msg["Date"] = datetime.datetime.now(datetime.timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")

    part1 = MIMEText(text_content, "plain")
    msg.attach(part1)
    if html_content:
        part2 = MIMEText(html_content, "html")
        msg.attach(part2)

    # Method 1: WVU Official SMTP Relay (port 25, authoritative SPF/DKIM)
    try:
        with smtplib.SMTP(WVU_SMTP_HOST, 25, timeout=10) as server:
            server.ehlo()
            server.sendmail(SENDER_EMAIL, [RECIPIENT_EMAIL], msg.as_string())
        print(f"[Notifier] Email sent via {WVU_SMTP_HOST} to {RECIPIENT_EMAIL}: {subject}")
        return True
    except Exception as e_wvu:
        print(f"[Notifier] {WVU_SMTP_HOST}:25 failed ({e_wvu}), trying localhost:25...")

    # Method 2: Localhost SMTP (port 25)
    try:
        with smtplib.SMTP("localhost", 25, timeout=10) as server:
            server.sendmail(SENDER_EMAIL, [RECIPIENT_EMAIL], msg.as_string())
        print(f"[Notifier] Email sent via localhost:25 to {RECIPIENT_EMAIL}: {subject}")
        return True
    except Exception as e_local:
        print(f"[Notifier] Localhost SMTP failed ({e_local}), trying sendmail pipe...")

    # Method 3: /usr/sbin/sendmail
    if os.path.exists("/usr/sbin/sendmail"):
        try:
            p = subprocess.Popen(
                ["/usr/sbin/sendmail", "-t", "-oi", "-f", SENDER_EMAIL],
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

    # Method 4: /bin/mail
    if os.path.exists("/bin/mail"):
        try:
            p = subprocess.Popen(
                ["/bin/mail", "-s", subject, "-r", SENDER_EMAIL, RECIPIENT_EMAIL],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            stdout, stderr = p.communicate(text_content, timeout=15)
            if p.returncode == 0:
                print(f"[Notifier] Email sent via /bin/mail to {RECIPIENT_EMAIL}")
                return True
        except Exception as e_mail:
            print(f"[Notifier] /bin/mail failed: {e_mail}")

    print("[-] All email delivery methods failed.")
    return False


def notify_shift_started(job_id: str, node_name: str, public_url: str = "") -> bool:
    subject = "shift manager - start"
    text = (
        f"Shift started.\n"
        f"Job: #{job_id}\n"
        f"Node: {node_name}\n"
        f"Status: Online & Healthy\n"
        f"URL: {public_url}\n"
    )
    html = f"""
    <div style="font-family:sans-serif;font-size:14px;color:#1e293b;line-height:1.5;">
        <p><strong>Shift started.</strong></p>
        <p>
            Job: <code>#{job_id}</code><br>
            Node: <code>{node_name}</code><br>
            Status: <span style="color:#16a34a;font-weight:600;">Online &amp; Healthy</span><br>
            URL: <a href="{public_url}">{public_url}</a>
        </p>
    </div>
    """
    return send_email(subject, text, html)


def notify_shift_shifting(old_job_id: str, new_job_id: str, new_node: str = "", public_url: str = "") -> bool:
    subject = "shift manager - shifting"
    text = (
        f"Shift switch initiated.\n"
        f"Old Job: #{old_job_id}\n"
        f"New Job: #{new_job_id}\n"
        f"Node: {new_node}\n"
        f"Status: Overlap handover in progress\n"
        f"URL: {public_url}\n"
    )
    html = f"""
    <div style="font-family:sans-serif;font-size:14px;color:#1e293b;line-height:1.5;">
        <p><strong>Shift switch initiated.</strong></p>
        <p>
            Old Job: <code>#{old_job_id}</code><br>
            New Job: <code>#{new_job_id}</code><br>
            Node: <code>{new_node}</code><br>
            Status: <span style="color:#d97706;font-weight:600;">Overlap handover in progress</span><br>
            URL: <a href="{public_url}">{public_url}</a>
        </p>
    </div>
    """
    return send_email(subject, text, html)


def notify_shift_success(old_job_id: str, new_job_id: str, new_node: str, public_url: str = "") -> bool:
    subject = "shift manager - success"
    text = (
        f"Shift switch successful!\n"
        f"Active Job: #{new_job_id}\n"
        f"Node: {new_node}\n"
        f"Previous Job: #{old_job_id} retired\n"
        f"Status: Zero-downtime transition complete\n"
        f"URL: {public_url}\n"
    )
    html = f"""
    <div style="font-family:sans-serif;font-size:14px;color:#1e293b;line-height:1.5;">
        <p><strong>Shift switch successful!</strong></p>
        <p>
            Active Job: <code>#{new_job_id}</code><br>
            Node: <code>{new_node}</code><br>
            Previous Job: <code>#{old_job_id}</code> (retired)<br>
            Status: <span style="color:#16a34a;font-weight:600;">Zero-downtime transition complete</span><br>
            URL: <a href="{public_url}">{public_url}</a>
        </p>
    </div>
    """
    return send_email(subject, text, html)


def notify_shift_failure(component: str, issue: str, action: str = "") -> bool:
    subject = "shift manager - failure"
    text = (
        f"Shift manager failure detected.\n"
        f"Component: {component}\n"
        f"Issue: {issue}\n"
        f"Action: {action}\n"
        f"Host: {socket.gethostname()}\n"
    )
    html = f"""
    <div style="font-family:sans-serif;font-size:14px;color:#1e293b;line-height:1.5;">
        <p style="color:#dc2626;font-weight:bold;">Shift manager failure detected.</p>
        <p>
            Component: <b>{component}</b><br>
            Issue: {issue}<br>
            Action Taken: {action}<br>
            Host: <code>{socket.gethostname()}</code>
        </p>
    </div>
    """
    return send_email(subject, text, html)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="RadExtract HPC Continuous Shift Notifier")
    parser.add_argument("positional_action", nargs="?", default=None)
    parser.add_argument("--event", "--action", dest="flag_action", default=None)
    parser.add_argument("args", nargs="*")
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

    if action == "start":
        job = parsed.job or (parsed.args[0] if len(parsed.args) > 0 else os.environ.get("SLURM_JOB_ID", "local"))
        node = parsed.node or (parsed.args[1] if len(parsed.args) > 1 else socket.gethostname())
        url = parsed.url or (parsed.args[2] if len(parsed.args) > 2 else "")
        ok = notify_shift_started(job, node, url)
        sys.exit(0 if ok else 1)
    elif action in ("handover", "success", "end"):
        old_j = parsed.args[0] if len(parsed.args) > 0 else "previous"
        new_j = parsed.job or (parsed.args[1] if len(parsed.args) > 1 else os.environ.get("SLURM_JOB_ID", "current"))
        node = parsed.node or (parsed.args[2] if len(parsed.args) > 2 else socket.gethostname())
        url = parsed.url or (parsed.args[3] if len(parsed.args) > 3 else "")
        ok = notify_shift_success(old_j, new_j, node, url)
        sys.exit(0 if ok else 1)
    elif action in ("shifting", "switch"):
        old_j = parsed.args[0] if len(parsed.args) > 0 else "previous"
        new_j = parsed.job or (parsed.args[1] if len(parsed.args) > 1 else os.environ.get("SLURM_JOB_ID", "current"))
        node = parsed.node or (parsed.args[2] if len(parsed.args) > 2 else socket.gethostname())
        url = parsed.url or (parsed.args[3] if len(parsed.args) > 3 else "")
        ok = notify_shift_shifting(old_j, new_j, node, url)
        sys.exit(0 if ok else 1)
    elif action in ("failure", "troubleshoot"):
        comp = parsed.args[0] if len(parsed.args) > 0 else "Service"
        issue = parsed.args[1] if len(parsed.args) > 1 else "Unresponsive"
        action_desc = parsed.details or (parsed.args[2] if len(parsed.args) > 2 else "Restarted")
        status = parsed.status or (parsed.args[3] if len(parsed.args) > 3 else "RESOLVED")
        if status in ("FAILED", "CRITICAL"):
            ok = notify_shift_failure(comp, issue, action_desc)
        else:
            # Resolved auto-troubleshoot or general notice
            subject = "shift manager - success" if status == "RESOLVED" else "shift manager - failure"
            text = f"Auto-recovery: {comp} - {issue}. Resolution: {action_desc}."
            html = f"<p><b>Auto-recovery:</b> {comp} - {issue}<br><b>Resolution:</b> {action_desc}</p>"
            ok = send_email(subject, text, html)
        sys.exit(0 if ok else 1)
    elif action == "test":
        subject = "shift manager - start"
        text = "Shift started.\nJob: #test\nNode: test-node\nStatus: Online & Healthy\n"
        ok = send_email(subject, text)
        sys.exit(0 if ok else 1)
    else:
        print(f"Unknown action: '{action}'. Usage: hpc_notifier.py [start|shifting|success|failure|test]")
        sys.exit(1)
