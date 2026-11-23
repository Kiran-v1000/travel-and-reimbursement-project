# Voyage · Travel & Reimbursement

A company-wide web app for business travel requests, configurable multi-level approvals,
expense claims with receipts, Finance review and reimbursement tracking — with a
tamper-evident audit trail.

**Stack:** React 18 + Vite + Tailwind + Framer Motion (client) · Node.js + Express + Prisma (server) · PostgreSQL.

## Features

| Area | What you get |
| --- | --- |
| Travel requests | Draft → submit → withdraw; live policy checks and an "approval route" preview before submitting; per-diem autofill from policy; duplicate a past trip; local autosave of unsent requests |
| Approval routing | Admin-configured rules by amount, department, cost center, trip type and policy exception; sequential levels with parallel approvers; reporting-hierarchy resolution; fallback for missing/inactive/self approvers; rule versioning; routing simulator |
| Delegation | Date-ranged, scoped (all / travel / expenses); audit records both delegate and original approver |
| Escalation | Cron job reassigns overdue steps to the approver's manager (or fallback) and sends reminders |
| Expenses | Report builder, receipt drag & drop (magic-byte validated), multi-currency with stored FX rate, duplicate / missing-receipt / category-limit / out-of-period / over-estimate detection, spend vs. approved estimate |
| Approvals inbox | Master/detail review, bulk approve, keyboard shortcuts (J/K, A, R, X), optimistic updates |
| Finance | Review queue, recode (audited), approve & schedule, return/reject with reason, record payment with reference |
| Reporting | Spend by month/category/department/cost center/currency, open approvals aging, exceptions, reimbursement aging, CSV exports that respect permissions |
| Audit | Hash-chained, append-only log with one-click integrity verification and CSV export; versions saved on every (re)submission |
| UX | Light/dark themes, command palette (Ctrl/⌘ K), page and list transitions, skeleton loading, responsive layout, `prefers-reduced-motion` support |

## Project structure (feature-based)

```
server/
  src/modules/<feature>/   *.routes.js · *.controller.js · *.service.js · *.validation.js · *.test.js
  src/shared/              middlewares · utils · errors
  src/config/env.js        environment validated at boot (zod)
  src/db/                  schema.prisma · migrations/ · seeds/ · pool.js
  src/jobs/                escalation cron
  src/app.js · server.js   build app / listen only
  tests/                   integration tests
client/
  src/app/                 router · providers · store (zustand)
  src/features/<feature>/  api · components · hooks · pages · index.js (public exports)
  src/shared/              components/ui · hooks · lib (axios) · utils
  src/layouts/ · assets/ · main.jsx
```

## Run locally

Prerequisites: Node.js 20+ and PostgreSQL 14+.

```bash
# 1. API
cd server
cp .env.example .env          # set DATABASE_URL and a long JWT_SECRET
npm install
npm run db:reset              # migrate + seed demo data (destroys data in that database)
npm run dev                   # http://localhost:4010

# 2. Web
cd ../client
cp .env.example .env
npm install
npm run dev                   # http://localhost:5195
```

Demo accounts (password `Voyage@123`): `rahul@` / `ananya@` / `priya@` (employees), `neha@` (manager),
`vikram@` (director, dept head), `arjun@` (sales head), `asha@` (CEO), `meera@` / `sanjay@` (Finance),
`auditor@` (read-only) — all `@voyage.io`. Administrator: `admin@utthunga.com` / `admin@123`.

Tests: `npm test` (unit) and `npm run test:e2e` (needs a seeded database) in `server/`.

## Built for 100,000 people

The app is load-tested with 100,011 users and about 1.5 million records. Everyday screens answer in about 100 to 170 ms (median) with zero errors under load. See [docs/SCALING.md](docs/SCALING.md) for the results, the design and the production sizing.

## Deploying on Linux

- Run `npm ci` and `npx prisma migrate deploy` on the host; never ship `node_modules`.
- Run the API as a pm2 cluster (`npm run start:cluster`, see `server/ecosystem.config.cjs`) on a high port, with nginx in front (`deploy/nginx.conf`).
- Build the client on the host (`npm run build`) so `VITE_*` values are correct, serve `client/dist`
  from nginx, and proxy `/api` to the Node server (same origin keeps the session cookie simple).
- Set `NODE_ENV=production` (secure cookies), `CLIENT_URL` to the public origin, and make
  `UPLOAD_DIR` an absolute path writable by the service user.
- Configure `SMTP_*` to enable email notifications; without it notifications are in-app only.

## Microsoft SSO (@utthunga.com)

Company users sign in with **Sign in with Microsoft** (Entra ID / Azure AD, OpenID Connect
authorization-code flow with PKCE, state and nonce). Only the configured tenant and the
`SSO_ALLOWED_DOMAINS` (default `utthunga.com`) are accepted. On first sign-in a user is linked
by email, or auto-created as an Employee (`SSO_AUTO_PROVISION`); an administrator then sets
their manager, department and role in **Administration → People**.

To switch it on, ask IT for an Entra ID app registration:

1. Platform **Web**, redirect URI `https://<your-host>/api/auth/sso/callback`
   (locally `http://localhost:5195/api/auth/sso/callback`).
2. Delegated permissions `openid`, `profile`, `email`, `User.Read`; create a client secret.
3. In `server/.env` set `AZURE_AD_TENANT_ID`, `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`,
   `AZURE_AD_REDIRECT_URI` and `SSO_ENABLED=true`, then restart the API.

The local administrator **admin@utthunga.com** signs in with a password (seeded from
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`; change it after first sign-in).

## Open decisions (from the SRS)

Payment/ERP integrations, real policy values, data residency and backup/retention targets
still need owners' decisions. Policy values and routing are already configurable in **Administration**.
