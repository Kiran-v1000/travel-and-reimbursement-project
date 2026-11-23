# Running Voyage for 100,000 people

This app is built and load-tested for a 100,000-person company. This page explains what was
done, what was measured, and how to run it in production.

## What was measured

Data set (`server/src/db/seeds/scale.js`): **100,011 people** in a functional hierarchy
(CEO → 10 BU heads → 100 directors → 1,000 managers → 98,890 employees), **200,000 expense
reports / 600,000 expense lines**, 60,000 travel requests, ~190,000 approval steps,
160,000 payments, 300,000 notifications.

Load test (`server/tests/load/load-test.js`, autocannon, 12 s per scenario, sessions rotated
across up to 2,000 real users). It ran on **one Windows developer laptop** with PostgreSQL 18 on the
same machine, one API process, and a pool of 20 connections. A production server will do better.

| Scenario | Throughput | p50 | p99 | Errors |
|---|---|---|---|---|
| Employee: dashboard | 277 req/s | 169 ms | 515 ms | 0 |
| Employee: my expense reports | 390 req/s | 124 ms | 197 ms | 0 |
| Employee: policy check + approval-route preview | 317 req/s | 151 ms | 336 ms | 0 |
| Employee: save travel draft (write + audit trail) | 181 req/s | 106 ms | 201 ms | 0 |
| Manager: approval inbox | 333 req/s | 139 ms | 266 ms | 0 |
| Manager: team expenses (~99 people) | 282 req/s | 169 ms | 356 ms | 0 |
| CEO: analytics, 100k people (warm) | 601 req/s | 7 ms | 25 ms | 0 |
| Finance: review queue | 194 req/s | 98 ms | 191 ms | 0 |
| People search (type-ahead) | 848 req/s | 52 ms | 108 ms | 0 |
| Admin: people list, page 500 | 91 req/s | 102 ms | 204 ms | 0 |

For scale: 100,000 employees filing one or two claims a month is about 2,000 to 5,000
submissions on a working day. Even a 10x Monday-morning peak is a small fraction of these
numbers.

**Known limit:** the *first* analytics view for a large team (for example a BU head over 10,000
people) is computed on demand. That takes a few seconds on this laptop, and up to about 10 s when
ten BU heads open it at the same moment. After that it is served from cache and refreshed in the
background. Organisation-wide analytics (Finance, Admin, the CEO) are pre-computed every
5 minutes. If cold large-team analytics ever matter, add a nightly spend roll-up table.

## What makes it scale

| Area | Design |
|---|---|
| Reporting hierarchy | Each user stores their full chain of managers (`User.ancestors`, GIN-indexed). "Everyone under X" is one index lookup, even for the CEO; there are no huge `IN (...)` lists. A manager change re-paths the whole subtree in one SQL statement. |
| Shared office IPs | Rate limits are per signed-in session, and per account+IP for password logins. A whole office behind one NAT IP is never locked out together. |
| Lists | Everything is paginated ("Load more"). Status counts double as totals and are cached for 30 s for team-wide views. Line counts are computed only for the page shown. |
| People pickers | Type-ahead search (max 20 results) backed by trigram indexes. The directory is never downloaded. |
| Analytics | One `GROUPING SETS` pass instead of five scans. Results are cached with stale-while-revalidate, at most two cold computations run at once, and each holds a single connection. |
| Guard rails | Database-level `statement_timeout = 30s` and `idle_in_transaction_session_timeout = 60s`, so a runaway query cannot hold the pool. Slow-query logging via `SLOW_QUERY_MS`. |
| Background jobs | Escalation claims work with `FOR UPDATE SKIP LOCKED`, so it is safe on every worker and never double-escalates. Old notifications are purged nightly in batches. |
| Audit trail | Hash-chain verification streams in 5,000-row pages, so millions of entries are fine. |
| Sessions | Stateless signed cookie plus a 30 s in-process user cache, so there's no session store to scale. |
| Indexes | Every foreign key used in deletes is indexed (a missing one made a delete scan 200k rows). |

## Production layout (Linux)

```
            nginx (TLS, static React build, /api proxy)      deploy/nginx.conf
                               │
           pm2 cluster: one Node worker per CPU core          server/ecosystem.config.cjs
                               │
          PgBouncer (transaction mode, optional)  →  PostgreSQL 16+ (dedicated host)
```

Recommended starting size for 100k employees: 2 app servers × 4 vCPU (or 1 × 8 vCPU), and
PostgreSQL on 4–8 vCPU / 16 GB RAM / SSD. Set `shared_buffers` ≈ 25% RAM and
`effective_cache_size` ≈ 70% RAM.

Connection budget: `workers × connection_limit` must stay under Postgres `max_connections`.
For example, 8 workers × 15 = 120, so either raise `max_connections` to 200 or add PgBouncer.

Receipts: `UPLOAD_DIR` must be **shared storage** (NFS or similar) when you run more than one
app server, so every server can read every receipt.

## Reproducing the test

```bash
cd server
createdb travel_reimbursement_scale
export DATABASE_URL="postgresql://USER:PASS@127.0.0.1:5432/travel_reimbursement_scale?schema=public"
npx prisma migrate deploy && node src/db/seeds/seed.js && node src/db/seeds/scale.js   # ~4 min
PORT=4011 API_RATE_LIMIT_PER_MIN=1000000 REQUEST_LOGGING=false node src/server.js &
TARGET=http://localhost:4011 node tests/load/load-test.js
```

`scale.js` refuses to run against the main `travel_reimbursement` database.
