# RadExtract Platform — VPS & Production Deployment Guide

This guide describes how to deploy the RadExtract Platform API backend to an Ubuntu VPS with automated HTTPS, persistent SQLite WAL database, and connect it to the GitHub Pages frontend (`vidhidhaduk05/ExtractExperimenting-web`).

---

## 1. Architecture Overview

- **Static Web Frontend**: Hosted on GitHub Pages (`https://vidhidhaduk05.github.io/ExtractExperimenting-web`)
- **Backend API**: FastAPI running inside Docker on your VPS
- **Reverse Proxy**: Caddy (automatic Let's Encrypt HTTPS certificates for your domain)
- **Database**: SQLite in WAL mode with online backup rotation
- **PDF Storage**: Host volume mounted into `/data/pdfs`
- **LLM Gateway**: Connectable to any OpenAI-compatible provider via environment variables

---

## 2. Server Prerequisites

- **VPS Requirements**: 2 vCPU, 4GB RAM (Ubuntu 22.04 or 24.04 LTS recommended)
- **Open Ports**: `80` (HTTP), `443` (HTTPS)
- **DNS**: An `A` record pointing your domain (e.g., `api.yourdomain.com`) to your VPS IP address
- **Docker & Docker Compose**:
  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER
  ```

---

## 3. Deployment Steps

### Step 1: Copy Deployment Files
On your VPS, create a directory and clone or copy the backend deployment files:
```bash
mkdir -p /opt/radextract
cd /opt/radextract
```

Required files in `/opt/radextract`:
- `Dockerfile`
- `docker-compose.yml`
- `Caddyfile`
- `requirements.txt`
- `.env.example`
- `seed.py`
- `backup_db.py`
- Backend application files (`main.py`, `config.py`, `database.py`, `routers/`, `services/`, etc.)

### Step 2: Configure Environment
Copy `.env.example` to `.env` and customize:
```bash
cp .env.example .env
nano .env
```
Key settings to set:
```ini
DOMAIN=api.yourdomain.com
SECRET_KEY=generate_with_openssl_rand_hex_32
ADMIN_USERNAME=admin
ADMIN_PASSWORD=YourStrongPasswordHere
CORS_ORIGINS=https://vidhidhaduk05.github.io,http://localhost:5173
LLM_BASE_URL=https://api.openai.com/v1/chat/completions # or your gemini gateway
LLM_API_KEY=your-api-key
LLM_MODEL=gemini-2.5-flash
```

### Step 3: Launch Containers
```bash
docker compose up -d --build
```

Check status:
```bash
docker compose ps
docker compose logs -f api
```

### Step 4: Seed Database and Create Admin User
Run the idempotent seed script inside the container:
```bash
docker compose exec api python seed.py
```
This initializes the database, creates the administrator user with the password from `.env`, verifies RoB tools, and seeds default project criteria.

### Step 5: Verify Health Endpoint
```bash
curl https://api.yourdomain.com/health
```
Response:
```json
{
  "status": "healthy",
  "version": "2.4.0",
  "env": "production",
  "db_backend": "sqlite",
  "storage_backend": "local"
}
```

---

## 4. Connecting the GitHub Pages Frontend

1. Open the deployed application at:
   `https://vidhidhaduk05.github.io/ExtractExperimenting-web/`
2. Click the **API Connection status icon** in the top navigation bar or the **Connect Backend** banner.
3. In the API Settings dialog:
   - Enter your VPS API endpoint: `https://api.yourdomain.com/api`
   - Click **Test Connection**.
   - Click **Save & Connect**.
4. The status turns green (**Live Backend**). All study uploads, screening decisions, and RoB assessments are now persistently stored in your VPS database.

---

## 5. Automated Backups

To run daily automated online backups:
```bash
crontab -e
```
Add the nightly cron entry (runs daily at 3:00 AM UTC):
```cron
0 3 * * * cd /opt/radextract && docker compose exec -T api python backup_db.py --retention 30 >> /var/log/radextract-backup.log 2>&1
```
Backups are saved to `./data/db/backups/` with `.db.gz` compression and automatic 30-day retention pruning.
