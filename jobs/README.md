# HPC Slurm Job Composer & Execution Guide
**West Virginia University CTSI HPC Cluster (`ctsi-hpc.hsc.wvu.edu`)**

This directory contains production Slurm batch scripts and continuous pipeline composition scripts for **RadExtract / ExtractExperimenting**.

---

## 1. Using the Open OnDemand (OOD) "Job Composer"

You can create, edit, and launch these jobs directly from the Open OnDemand web portal without using the command line:

### Step 1: Open Job Composer
1. In your browser, navigate to the OOD portal: `https://ctsi-hpc.hsc.wvu.edu/`
2. In the top navigation menu, click **Jobs** -> **Job Composer**.

### Step 2: Create a New Job
1. Click the blue **"New Job"** button.
2. Select **"From Specified Path"**.
3. Fill in the fields:
   - **Source path**: `/home/vd00026/Desktop/Software/jobs/radextract_web.slurm` (for web app)  
     *or* `/home/vd00026/Desktop/Software/jobs/screening_laya_gpu.slurm` (for Laya GPU screening)
   - **Job Name**: e.g., `RadExtract Web Server` or `Laya GPU Screener`
4. Click **Save**.

### Step 3: Run the Job
1. Select the created job in the list.
2. Click the green **"Submit"** button (play icon) at the top.
3. The status will transition from `Queued` to `Running`.

### Step 4: Accessing Files & Live Web App
- In the right-hand panel of the Job Composer, click **"Open in File Manager"** or view the log files (`slurm_*.out`).
- When running `radextract_web.slurm`, open `slurm_radextract_web_<jobid>.out` to see your live web application link:
  ```
  https://ctsi-hpc.hsc.wvu.edu/rnode/<node-name>/5173/
  ```
- Click that link to interact with the full web platform in your browser.

---

## 2. Running Jobs Directly via Command Line

From a terminal on the login node (`hsc-hpc-l-001`) or interactive desktop:

```bash
# 1. Start the interactive Web & Backend Platform (runs up to 8 hours):
sbatch jobs/radextract_web.slurm

# 2. Start high-throughput Laya GPU screening on Tesla V100S:
sbatch jobs/screening_laya_gpu.slurm

# 3. Check status of running jobs:
squeue -u $USER

# 4. View live logs:
tail -f slurm_*.out
```

---

## 3. Composing Jobs to Run Continuously / Multi-Stage Chaining

To compose jobs that run continuously or trigger sequential stages (e.g., screening runs first on GPU, then automatically launches the web UI for review):

```bash
# Run the pipeline composer:
./jobs/compose_continuous_pipeline.sh chain
```

Under the hood, this uses Slurm dependency chaining:
```bash
JOB1=$(sbatch jobs/screening_laya_gpu.slurm | awk '{print $4}')
sbatch --dependency=afterok:$JOB1 jobs/radextract_web.slurm
```
