# Security

How Voyage protects travel, expense, receipt and payment data: what is enforced in the code, how it
is verified, and what still depends on infrastructure or company decisions.

Status key: **Done** = implemented and covered by automated tests or a recorded check ·
**Needs IT** = needs infrastructure · **Decision** = needs a company / policy decision.

## 1. Authorization

| Control | Status | Where / how verified |
|---|---|---|
| Every request is authenticated and every record is checked on the server (owner, assigned approver or active delegate, reporting line, or role). Hidden UI is never relied on. | Done | `shared/utils/access.js`, module services; `tests/authorization.e2e.test.js` changes IDs in requests and expects 403 |
| Employees see only their own records; lists never leak, even with `scope=all` | Done | `visibilityWhere`; authorization tests |
| Approvers act only on steps assigned or delegated to them | Done | `approvals.service.js` `canActOn`; tests (single and bulk) |
| Nobody approves their own trip or expense, including Finance on their own claim (review, re-code **and payment**) | Done | `approvals.service.js`, `finance.service.js` `loadForFinance`; tests |
| Role areas: Finance (finance desk, accounting export), Admin (rules, policy, people), Auditor (read-only) | Done | `requireRole` on routes; tests incl. auditor write attempts |
| Managers can read everything raised by their whole reporting line; Finance can read every trip and expense | **Decision** | Current design. Confirm, or restrict to direct reports / expenses only |

## 2. Approval integrity

| Control | Status | Where / how verified |
|---|---|---|
| Approval rules and policy can be changed only by Administrators | Done | `admin.routes.js`; tests |
| Delegation: people delegate their **own** approvals (Admins can set one up for anyone); delegating as someone else is refused | Done | `users.service.js`; tests |
| Delegation limited to Administrators only | **Decision** | The requirement asks for this; today managers set their own (normal for leave cover). Say if it must be admin-only |
| Reason required to reject, return, approve a report that breaks policy (Finance override), submit a policy exception, or pay a different amount than approved | Done | Services + validation; tests |
| Before/after values recorded for approvals, payments, policy settings, approval rules, categories, currencies, departments, cost centers, people and delegations | Done | `audit(…, { tx })` calls; tests read the stored `from` / `to` |
| Approvals, payments, policy, rule and delegation changes commit **together with** their audit entry; exports and accounting downloads are refused if the audit entry cannot be written | Done | `audit.service.js` (`tx` / `strict` options) |
| Corrections keep earlier decisions: each resubmission is a new round; earlier rounds' steps, comments and revision snapshots are kept | Done | `approvals.engine.js`, `Revision` table |

## 3. Authentication and sessions

| Control | Status | Where / how verified |
|---|---|---|
| Company identity provider (Microsoft Entra ID, OIDC + PKCE) | Done (code) / **Needs IT** | `auth.sso.service.js`. Needs the app registration (tenant, client ID, secret) |
| MFA for Finance and Administrators | **Needs IT** + Done (switch) | Turn on MFA via Entra **Conditional Access**, then set `PRIVILEGED_SSO_ONLY=true`: Finance/Admin password sign-in is refused (except `BREAK_GLASS_EMAILS`) |
| Server-side sessions: sign-out ends the session on the server; inactivity timeout (30 min; Finance/Admin 15 min); absolute lifetime (8 h; Finance/Admin 4 h); "sign out other devices" | Done | `auth.sessions.js`; tests |
| Deactivated people lose access at once (sessions ended; all requests refused within seconds on every server) | Done | `users.service.js`, HR import; tests |
| Password change / admin reset ends every other session | Done | `auth.service.js`, `users.service.js` |
| Cookies: HttpOnly, SameSite=Lax, Secure in production; failed sign-ins rate-limited per account + IP | Done | `auth.controller.js`, `rateLimits.js` |

## 4. Receipts and attachments

| Control | Status | Where / how verified |
|---|---|---|
| Type checked from file content (not the extension): JPG, PNG, WEBP, PDF only; size limit (`MAX_UPLOAD_MB`); max 5 per upload | Done | `attachments.service.js`, `attachments.routes.js` |
| Random stored names, `path.basename` on read: no path traversal, no executable uploads | Done | tests (`../../etc/passwd` → 404) |
| Private storage, never public links; every download checks the viewer's permission | Done | `UPLOAD_DIR` is not served statically; tests (401 / 403 / 200) |
| Served with `Cache-Control: private, no-store`, `nosniff`, a script-free CSP (images fully sandboxed), same-origin only | Done | `attachments.controller.js`; tests |
| Malware scanning (ClamAV), failing closed | Done (code) / **Needs IT** | `malwareScan.js` + unit tests with a fake scanner. Install `clamav-daemon` and set `CLAMAV_HOST` (production warns at start-up while it is unset) |

## 5. Data protection

| Control | Status | Where / how verified |
|---|---|---|
| No bank account or card numbers are collected or stored; payments keep only a transaction reference | Done | `schema.prisma` |
| Retention: closed records purged after the retention period (receipts deleted, personal text removed); legal holds | Done | `docs/` + `compliance` module |
| Secrets only in environment variables; `.env` is git-ignored; production refuses weak / placeholder secrets | Done | `config/env.js`; CI secret scanning (gitleaks) |
| Audit trail and logs never store passwords, tokens or account numbers (redacted by key name); request logs strip sign-in codes / tokens from URLs and Referer | Done | `audit.service.js` `redact`, `shared/utils/redact.js`; unit tests |
| HTTPS (TLS 1.2+, HSTS) | **Needs IT** | `deploy/nginx.conf` is ready; needs the certificate and domain |
| Encryption at rest (database, backups, uploads) | **Needs IT** | Use encrypted disks / a managed PostgreSQL with encryption; encrypt the backup target |
| Who may see payment references and amounts (Finance, Admin, Auditor today) | **Decision** | Confirm |

## 6. Input and integration security

| Control | Status | Where / how verified |
|---|---|---|
| Every request body validated by a schema; IDs, amounts (positive, capped), dates, enums, approval actions | Done | `*.validation.js` |
| Currencies must exist and be active (no silent 1:1 conversion); categories and cost centers must be active | Done | `shared/utils/index.js`; tests |
| Rate limits (per session; failed sign-ins per account + IP; SSO), statement timeouts, safe error messages (no stack traces in production) | Done | `rateLimits.js`, `db/pool.js`, `errorHandler` |
| Integrations: Microsoft sign-in (PKCE, signed state, domain allow-list), SMTP (TLS), HR import (Admin only, validated, dry-run first), accounting export (Finance only, audited) | Done | Respective modules |
| HR, accounting or payment **API** integrations | n/a today | File-based only. Any future API integration needs its own credentials, IP allow-list and audit |

## 7. Audit and monitoring

| Control | Status | Where / how verified |
|---|---|---|
| Logged: sign-ins (and failures / blocks), sign-outs, authorization failures (403), exports, approval decisions, policy overrides, payment status changes, policy / rule / delegation / people changes, retention runs, legal holds | Done | `audit(...)` calls; tests |
| Tamper protection: hash chain (verifiable in the app) **and** a database trigger that blocks UPDATE / DELETE / TRUNCATE on the audit table for every role | Done | migration `20261127100000_sessions_audit_lock`; tests |
| Review and export of the audit trail limited to Admin, Auditor and Finance | Done / **Decision** | Confirm whether Finance should read the full audit trail |
| Alerts (e.g. many 403s, sign-ins from new countries, audit chain broken) | **Needs IT** | Forward server logs to the company SIEM; alert on `security.access_denied` bursts and a failing `/api/audit/verify` |

A database superuser can still disable the trigger; the hash chain then reveals any edit. For
stronger guarantees, ship audit entries to write-once storage (SIEM / object lock) as well.

## 8. Secure development and operations

| Control | Status | Where / how verified |
|---|---|---|
| Dependency audit: production packages on every CI run; all packages (incl. dev tools) in the weekly security workflow; Dependabot updates | Done | `ci.yml`, `security.yml`, `dependabot.yml`. Current result: 0 vulnerabilities in server and client |
| Code scanning (CodeQL, security-extended) and secret scanning (gitleaks) | Done (config) | `security.yml` — runs once pushed to GitHub |
| CI token least privilege (`contents: read`) | Done | `ci.yml`, `security.yml` |
| Accessibility lint, unit and integration tests incl. authorization across users and roles | Done | `npm test`, `npm run test:e2e`, `npm run lint:a11y` |
| Branch protection (required reviews and checks on `main`), who may deploy / hold production credentials | **Decision / Needs IT** | Set in GitHub settings and on the server |
| Backup and restore | Done | `deploy/backup.sh`, `restore.sh`, systemd timer; restore tested |
| Incident response and breach notification | Draft | `docs/INCIDENT_RESPONSE.md` — needs management approval and named contacts |
