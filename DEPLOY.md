# Inspiro LMS — Server Deployment Runbook

Target: **Hostinger KVM VPS, Mumbai, Ubuntu 24.04**
Domain: **api.inspiroiasacademy.in** (API) · **admin.inspiroiasacademy.in** (Vercel)

Prereqs already done:
- Neon DB migrated + seeded (admin `+919999999999`).
- `.env.production` filled locally (uploaded in step 4).
- DNS A record `api` → VPS IP (GoDaddy).

Run these on the **VPS** (Hostinger browser terminal or SSH). Paste output back if anything errors.

---

## 1. System + Docker
```bash
apt update && apt -y upgrade
curl -fsSL https://get.docker.com | sh
# Firewall
apt -y install ufw
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw --force enable
```

## 2. Get the code
```bash
mkdir -p /opt && cd /opt
# Private repo → use a GitHub Personal Access Token (repo scope) as the password.
git clone https://github.com/<your-username>/inspiro-lms.git inspiro
cd inspiro
```

## 3. TLS certificate (before starting nginx)
```bash
apt -y install certbot
# Obtains the cert on port 80 (nothing else is bound yet)
certbot certonly --standalone -d api.inspiroiasacademy.in --agree-tos -m ict.uvaisalungal@gmail.com -n
# Auto-renew (certbot installs a systemd timer automatically; verify)
systemctl list-timers | grep certbot || true
```

## 4. Upload the environment file
From your **Windows** machine (PowerShell), not the server:
```powershell
scp D:\INSPIRO\.env.production root@<VPS-IP>:/opt/inspiro/.env.production
```

## 5. Launch
```bash
cd /opt/inspiro
export REDIS_PASSWORD=$(grep '^REDIS_PASSWORD=' .env.production | cut -d= -f2)
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api    # watch it boot; Ctrl-C to stop tailing
```
If the API prints missing-env-var lines and exits, fix `.env.production` and re-run `up -d`.

## 6. Verify
```bash
curl -s https://api.inspiroiasacademy.in/health
# → {"status":"ok","timestamp":"..."}
```
Also open `https://api.inspiroiasacademy.in/health` in a browser.

## 7. After content exists (later)
```bash
# Build the semantic index once courses/current-affairs are added via admin
curl -X POST https://api.inspiroiasacademy.in/api/v1/admin/rag/reindex \
  -H "Authorization: Bearer <admin_access_token>"
```

---

## Updating later
```bash
cd /opt/inspiro && git pull && docker compose -f docker-compose.prod.yml up -d --build
```

## Bunny webhook (after API is live)
Bunny Stream → library 697433 → API → Webhook URL:
`https://api.inspiroiasacademy.in/api/v1/webhooks/bunny?token=<BUNNY_WEBHOOK_SECRET>`
