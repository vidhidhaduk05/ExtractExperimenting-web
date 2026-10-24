# RadExtract 24/7 Autonomous Job Scheduler & Handover Guide
**West Virginia University CTSI HPC Cluster (`ctsi-hpc.hsc.wvu.edu`)**  
**Alert Recipient:** `vidhidhaduk05@gmail.com`

---

## 1. How the Job Scheduler is Working Right Now

The HPC environment uses **Slurm Workload Manager (v20.02.7)**. The application runs as a **3-Tier Distributed Architecture**:

```
[Tier 1: Biomni-R0 GPU] (Port 18000)
       ▲
       │ Local High-Speed IPC
       ▼
[Tier 2: FastAPI Platform & AI Screening] (Port 8000) <--> Scratch SQLite WAL (/tmp)
       ▲
       │ Local Tunnel Binding
       ▼
[Tier 3: Cloudflare Ingress Gateway] <--> Auto-publishes to GitHub Pages Web App
```

### Current Operational Context:
- **Interactive Session:** The platform is currently hosted under an Open OnDemand desktop session on GPU compute node `hsc-hpc-g-001` (Slurm Job ID `775`, 2x Tesla V100S 32GB GPUs, 40 CPUs, 24-hour wallclock limit).
- **The 24-Hour Boundary:** On the WVU CTSI cluster, the maximum allowable wallclock time per Slurm job is **24:00:00**. When this limit is reached, Slurm sends `SIGTERM` / `SIGKILL`, terminating the processes on that compute node.
- **The Challenge:** To keep services, models, and background screening running perpetually without downtime or manual restarts, jobs must be chained with an automated overlap handover.

---

## 2. Maximizing Scheduler Use: 24-Hour Continuous Relay with 1-Hour Overlap Handover

To achieve **zero downtime**, we implement the **Baton Pass Handover Protocol**:

```
Time (Hours)  0h                     23h         24h                     47h         48h
              ┌───────────────────────┬───────────┐
Shift A (24h) │  Active Primary Node  │  Overlap  │ (Retires)
              └───────────────────────┴─────┬─────┘
                                            │ Baton Handover (Auto-Verified)
                                            ▼
Shift B (24h)                             ┌───────────┬───────────────────────┬───────────┐
                                          │  Overlap  │  Active Primary Node  │  Overlap  │ (Retires)
                                          └───────────┴───────────────────────┴─────┬─────┘
                                                                                    ▼
Shift C (24h)                                                                     ┌───────────┐ ...
```

### How the 1-Hour Overlap Works Step-by-Step:

1. **Hours 0:00 – 23:00 (Primary Execution):**
   - Job A serves all inference (Biomni-R0), backend API calls, and screening tasks.
   - The watchdog monitors process health every 3 minutes.

2. **Hour 23:00 (Handover Trigger):**
   - Job A's shift manager detects that 23 hours have elapsed (1 hour before expiration).
   - It automatically submits the successor job: `sbatch jobs/continuous_shift.slurm`.
   - Slurm schedules and provisions Job B on an available GPU node.

3. **Hours 23:00 – 24:00 (The 1-Hour Overlap Phase):**
   - Job B starts up on its allocated compute node.
   - Job B syncs the latest database from persistent NFS storage (`radextract_platform/backend/radextract.db`).
   - Job B spins up Biomni-R0 on port 18000 and FastAPI on port 8000.
   - Job B runs automated self-diagnostics to verify both endpoints respond healthy.
   - Job B starts a Cloudflare tunnel and updates `public/active_backend.json` with its new URL, committing and pushing to GitHub so the web app instantly routes to the new healthy node.
   - Job B sends an email alert to `vidhidhaduk05@gmail.com`:
     > **✅ Shift Handover SUCCESSFUL: Job A ➔ Job B on `<node>`. Zero-downtime transition complete.**

4. **Hour 24:00 (Graceful Retirement):**
   - Job A reaches its 24-hour limit.
   - Job A's exit trap flushes its scratch SQLite WAL back to persistent storage.
   - Job A dispatches a completion email:
     > **🏁 Shift Concluded Gracefully: Job A retired.**
   - Job B is now the sole primary node, and at its 23rd hour, it spawns Job C.
   - This creates an **unbroken, perpetual 24/7 cycle**.

---

## 3. Automated Troubleshooting & Self-Healing Watchdog

Inside every running job, `jobs/troubleshoot_watchdog.sh` runs every 180 seconds. It performs automated self-healing without requiring any human intervention:

| Component | Failure Symptom | Automated Action Taken | Email Alert Dispatched |
|---|---|---|---|
| **Tier 1 (Biomni-R0)** | Port 18000 unresponsive | Kills stale bridge process, restarts `biomni_bridge_service.py`, verifies `/health` | `⚠️ [Auto-Troubleshoot] RESOLVED: Tier 1: Biomni-R0 GPU` |
| **Tier 2 (FastAPI)** | Port 8000 unresponsive | Kills old uvicorn workers, flushes scratch DB, restarts FastAPI with 2 workers | `⚠️ [Auto-Troubleshoot] RESOLVED: Tier 2: FastAPI Backend` |
| **Tier 3 (Cloudflare)** | Ingress connection severed | Spawns fresh tunnel, extracts new URL, updates `active_backend.json`, pushes to GitHub | `⚠️ [Auto-Troubleshoot] RESOLVED: Tier 3: Public Ingress Gateway` |
| **Storage (`/tmp`)** | Disk usage > 90% | Purges temporary image renders, stale sockets, and caches older than 60 mins | `⚠️ [Auto-Troubleshoot] RESOLVED: Disk Storage` |

---

## 4. Email Notification Matrix (`vidhidhaduk05@gmail.com`)

Every critical event delivers a structured HTML status card directly to `vidhidhaduk05@gmail.com`:

1. **Shift Started Alert:**
   - Subject: `🟢 [RadExtract HPC] Shift Started - Job #<id> on <node>`
   - Includes: Job ID, Compute Node, Allocated Walltime (24h), Next Handover time, Public Gateway URL.

2. **Shift Handover Success Alert:**
   - Subject: `✅ [RadExtract HPC] Shift Handover SUCCESSFUL: Job #<old> ➔ #<new>`
   - Includes: Outgoing Job ID, Incoming Job ID, New Node, Verified Services, Public URL.

3. **Auto-Troubleshooting Alert:**
   - Subject: `⚠️ [RadExtract HPC Auto-Troubleshoot] RESOLVED: <Component>`
   - Includes: Affected Component, Issue Detected, Action Taken, Recovery Status, Node Name.

4. **Shift Concluded Alert:**
   - Subject: `🏁 [RadExtract HPC] Shift Concluded - Job #<id> on <node>`
   - Includes: Job ID, Node Name, Clean Exit Confirmation, Database Sync Status.

5. **Slurm Native Fallback Alerts:**
   - In addition to Python SMTP, Slurm natively notifies `vidhidhaduk05@gmail.com` via `#SBATCH --mail-type=BEGIN,END,FAIL,TIME_LIMIT_90`.

---

## 5. How to Launch and Manage

### Option A: From the Command Line (SSH or Desktop Terminal)

```bash
# 1. Start the 24-hour continuous relay with automated 1-hour overlap:
sbatch jobs/continuous_shift.slurm

# 2. Check running and scheduled jobs:
squeue -u $USER

# 3. View live logs of the current shift:
tail -f slurm_shift_*.out

# 4. View watchdog & troubleshooting log:
tail -f /home/vd00026/troubleshoot_watchdog.log

# 5. Send a test email to verify notification delivery:
python3 jobs/hpc_notifier.py test
```

### Option B: Using Open OnDemand (OOD) Job Composer (Browser)

1. Navigate to: `https://ctsi-hpc.hsc.wvu.edu/`
2. In the top navigation bar, select **Jobs** ➔ **Job Composer**.
3. Click **"New Job"** ➔ **"From Specified Path"**.
4. Set path to: `/home/vd00026/Desktop/Software/jobs/continuous_shift.slurm`.
5. Click **Save**, then click the green **"Submit"** button.
6. The job will start immediately, send a confirmation email to `vidhidhaduk05@gmail.com`, and maintain 24/7 continuous operation with automated handovers.
