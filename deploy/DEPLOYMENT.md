# Deploying Voyage on Linux

A step-by-step runbook for Ubuntu 22.04 / 24.04. Sizing for ~100,000 employees is in
[`docs/SCALING.md`](../docs/SCALING.md).

```
Users ──HTTPS──▶ nginx ──▶ pm2 cluster (Node API, one worker per core) ──▶ PostgreSQL 16
                  │
                  └── serves the built React app (client/dist)
```

## 1. Server packages

```bash
sudo apt update && sudo apt install -y nginx postgresql-16 postgresql-contrib curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
sudo npm install -g pm2
sudo useradd --system --create-home --shell /bin/bash voyage
```

`postgresql-contrib` provides `pg_trgm`, which the people search needs.

## 2. Database

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE voyage LOGIN PASSWORD 'use-a-long-random-password';
CREATE DATABASE voyage OWNER voyage;
SQL
```

For 100k employees, set PostgreSQL `shared_buffers` to about 25% of RAM and
`effective_cache_size` to about 70% (in `/etc/postgresql/16/main/postgresql.conf`).

## 3. Code and configuration

```bash
sudo mkdir -p /opt/voyage /var/lib/voyage/uploads /var/backups/voyage
sudo chown -R voyage:voyage /opt/voyage /var/lib/voyage /var/backups/voyage
sudo -u voyage git clone https://github.com/Kiran-v1000/travel-and-reimbursement-project.git /opt/voyage
cd /opt/voyage/server && sudo -u voyage cp .env.example .env && sudo -u voyage nano .env
```

Production `.env` essentials (the API **refuses to start** if any of these are unsafe):

| Setting | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `postgresql://voyage:<password>@localhost:5432/voyage?schema=public&connection_limit=15&pool_timeout=20` |
| `JWT_SECRET` | 64+ random characters: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `CLIENT_URL` | `https://travel.utthunga.com` (https only) |
| `UPLOAD_DIR` | `/var/lib/voyage/uploads` (absolute; shared storage if you run several app servers) |
| `SSO_ENABLED`, `AZURE_AD_*` | from IT's Entra ID app registration; redirect URI `https://travel.utthunga.com/api/auth/sso/callback` |
| `SMTP_*`, `MAIL_FROM` | company mail relay (optional - without it notifications are in-app only) |

`chmod 600 .env` - it holds secrets. Never commit it.

## 4. Install, migrate, bootstrap

```bash
cd /opt/voyage/server
sudo -u voyage npm ci --omit=dev && sudo -u voyage npx prisma generate
sudo -u voyage npx prisma migrate deploy
sudo -u voyage SEED_ADMIN_EMAIL=it.admin@utthunga.com SEED_ADMIN_PASSWORD='<12+ chars, mixed case, number, symbol>' npm run db:seed:prod
```

`db:seed:prod` creates only reference data, default approval rules and the first administrator.
That administrator must choose a new password at first sign-in. The demo seed refuses to run when
`NODE_ENV=production`.

## 5. Web app

Build on the server (or in CI with the same settings), so `VITE_*` values are correct:

```bash
cd /opt/voyage/client && sudo -u voyage npm ci && sudo -u voyage npm run build
```

## 6. Run the API (pm2 cluster)

```bash
cd /opt/voyage/server
sudo -u voyage pm2 start ecosystem.config.cjs --env production
sudo -u voyage pm2 save
sudo env PATH=$PATH pm2 startup systemd -u voyage --hp /home/voyage   # start on boot
sudo -u voyage pm2 install pm2-logrotate                               # keep logs bounded
```

Deploying a new version: `git pull && npm ci --omit=dev && npx prisma migrate deploy && pm2 reload voyage-api`
(rolling, no downtime), then rebuild the client if it changed.

## 7. nginx + TLS

```bash
sudo cp /opt/voyage/deploy/nginx.conf /etc/nginx/sites-available/voyage
sudo nano /etc/nginx/sites-available/voyage     # server_name + certificate paths
sudo ln -s /etc/nginx/sites-available/voyage /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx
```

## 8. Backups

```bash
sudo cp /opt/voyage/deploy/voyage-backup.service /opt/voyage/deploy/voyage-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now voyage-backup.timer
sudo systemctl start voyage-backup.service && journalctl -u voyage-backup -n 20   # run one now
```

Every night: a checked `pg_dump` plus a receipts archive, kept 14 days in `/var/backups/voyage`.
**Copy them off the server** (object storage or another site). Practise a restore every month:

```bash
createdb voyage_restore_check
/opt/voyage/deploy/restore.sh /var/backups/voyage/voyage-db-<stamp>.dump postgresql://voyage:<pw>@localhost/voyage_restore_check
```

The audit trail's hash chain survives a restore. Administration → Audit trail → "Verify integrity"
confirms that nothing was altered.

## 9. Monitoring

* **Uptime:** `crontab -e` as `voyage`, then
  `MAILTO=it-alerts@utthunga.com` and
  `*/5 * * * * /opt/voyage/deploy/healthcheck.sh https://travel.utthunga.com`.
  It mails only when the API or the database is down.
* **Errors and slow SQL:** `pm2 logs voyage-api`. `SLOW_QUERY_MS=500` logs every query over 500 ms.
* **Live load:** `pm2 monit`.

## 10. Go-live checklist

- [ ] `.env` filled, `chmod 600`, API starts without "Refusing to start"
- [ ] HTTPS works and http redirects to https
- [ ] First admin signed in and changed the password
- [ ] Microsoft sign-in tested with a real @utthunga.com account (or people imported via CSV)
- [ ] Policy limits and approval rules reviewed by Finance (Administration)
- [ ] One backup run, one test restore done, backups copied off-server
- [ ] Health-check cron mails a test alert
- [ ] CI is green on the commit being deployed
