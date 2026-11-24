/**
 * Load test against a 100k-person scale database (see src/db/seeds/scale.js).
 *
 *   1. Start an API on the scale DB, e.g.
 *      DATABASE_URL=...scale_db PORT=4011 API_RATE_LIMIT_PER_MIN=100000 REQUEST_LOGGING=false node src/server.js
 *   2. DATABASE_URL=...scale_db TARGET=http://localhost:4011 node tests/load/load-test.js
 *
 * Each scenario rotates through many real users' sessions, like real traffic does.
 */
import autocannon from 'autocannon';
import { createSession } from '../../src/modules/auth/auth.sessions.js';
import '../../src/config/env.js';
import { prisma } from '../../src/db/pool.js';
import { startLiveDashboard } from './live-dashboard.js';

const TARGET = process.env.TARGET || 'http://localhost:4011';
const DURATION = Number(process.env.DURATION || 15);
// --live: real-time dashboard on http://localhost:4099 (LIVE_PORT) while the test runs.
const live = process.argv.includes('--live') ? startLiveDashboard(Number(process.env.LIVE_PORT || 4099)) : null;
const publish = (m) => live?.send(m);

// Real server-side sessions (the API rejects tokens without one).
const token = async (u) => `tr_session=${(await createSession(u, null, 'LOADTEST')).token}`;
const pool = async (where, take) => Promise.all((await prisma.user.findMany({ where, select: { id: true, role: true }, take })).map(token));

const employees = await pool({ id: { startsWith: 'emp-' } }, 2000);
const managers = await pool({ id: { startsWith: 'mgr-' } }, 500);
const buHeads = await pool({ id: { startsWith: 'bu-' } }, 10);
const ceo = await pool({ email: 'asha@voyage.io' }, 1);
const finance = await pool({ role: 'FINANCE' }, 5);
const admin = await pool({ role: 'ADMIN' }, 1);
const cc = await prisma.costCenter.findFirst();
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const scenarios = [
  { name: 'Employee: dashboard', path: '/api/reports/dashboard', who: employees, connections: 50 },
  { name: 'Employee: my expense reports', path: '/api/expenses?scope=mine', who: employees, connections: 50 },
  { name: 'Employee: policy check + route preview', method: 'POST', path: '/api/travel/policy-preview', who: employees, connections: 50,
    body: JSON.stringify({ title: 'Load test trip', purpose: 'Customer workshop for load testing', travelType: 'DOMESTIC', origin: 'Bengaluru', destination: 'Mumbai',
      startDate: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), endDate: new Date(Date.now() + 33 * 864e5).toISOString().slice(0, 10),
      estTransport: 6000, estLodging: 12000, estMeals: 4000, estOther: 0, currency: 'INR', costCenterId: cc.id }) },
  { name: 'Employee: save travel draft (write + audit)', method: 'POST', path: '/api/travel', who: employees, connections: 20,
    body: JSON.stringify({ title: 'Load test draft', purpose: 'Customer workshop for load testing', travelType: 'DOMESTIC', origin: 'Bengaluru', destination: 'Pune',
      startDate: new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10), endDate: new Date(Date.now() + 42 * 864e5).toISOString().slice(0, 10),
      estTransport: 3000, estLodging: 6000, estMeals: 2000, estOther: 0, currency: 'INR', costCenterId: cc.id }) },
  { name: 'Manager: approval inbox', path: '/api/approvals/inbox', who: managers, connections: 50 },
  { name: 'Manager: team expenses (~99 people)', path: '/api/expenses?scope=all', who: managers, connections: 50 },
  { name: 'BU head: analytics (~10,000 people)', path: '/api/reports/analytics', who: buHeads, connections: 10, timeout: 30 },
  { name: 'CEO: analytics (100,000 people)', path: '/api/reports/analytics', who: ceo, connections: 5, timeout: 30 },
  { name: 'Finance: review queue', path: '/api/finance/queue', who: finance, connections: 20 },
  { name: 'Anyone: people search', path: '/api/users/directory?search=emp1234', who: employees, connections: 50 },
  { name: 'Admin: people list page 500', path: '/api/users?page=500&pageSize=50', who: admin, connections: 10 },
];

const rows = [];
const people = await prisma.user.count();
publish({ type: 'info', text: `Target ${TARGET} · ${people.toLocaleString('en-IN')} people in the database · ${scenarios.length} scenarios × ${DURATION}s each` });
if (live) await new Promise((r) => setTimeout(r, Number(process.env.LIVE_WAIT_SECONDS || 8) * 1000)); // let the browser connect

const pct = (arr, p) => (arr.length ? arr.sort((x, y) => x - y)[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0);
for (const [index, s] of scenarios.entries()) {
  publish({ type: 'start', name: s.name, index: index + 1, total: scenarios.length, connections: s.connections });
  let window = [];
  let errors = 0;
  const started = Date.now();
  const result = await new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        url: TARGET + s.path,
        method: s.method ?? 'GET',
        connections: s.connections,
        duration: DURATION,
        // Same patience as the app: analytics may take a while the first time (client waits up to 60s).
        timeout: s.timeout ?? 10,
        headers: { 'content-type': 'application/json' },
        body: s.body,
        requests: [{ setupRequest: (req) => ({ ...req, headers: { ...req.headers, cookie: pick(s.who) } }) }],
      },
      (err, res) => (err ? reject(err) : resolve(res)),
    );
    // Per-second numbers for the live view.
    instance.on('response', (_client, status, _bytes, ms) => {
      window.push(ms);
      if (status >= 400) errors++;
    });
    instance.on('reqError', () => errors++);
    const timer = setInterval(() => {
      publish({ type: 'tick', rps: window.length, p50: Math.round(pct(window, 0.5)), p99: Math.round(pct(window, 0.99)), errors, elapsed: (Date.now() - started) / 1000, duration: DURATION });
      window = [];
    }, 1000);
    instance.on('done', () => clearInterval(timer));
  });
  const row = {
    scenario: s.name,
    'req/s': Math.round(result.requests.average),
    'p50 ms': result.latency.p50,
    'p97.5 ms': result.latency.p97_5,
    'p99 ms': result.latency.p99,
    requests: result.requests.total,
    errors: result.errors + result.timeouts + result.non2xx,
  };
  rows.push(row);
  publish({ type: 'result', row });
  console.log(`${row.scenario.padEnd(46)} ${String(row['req/s']).padStart(6)} req/s  p50 ${row['p50 ms']}ms  p99 ${row['p99 ms']}ms  errors ${row.errors}`);
}
const totalReq = rows.reduce((a, r) => a + r.requests, 0);
const totalErr = rows.reduce((a, r) => a + r.errors, 0);
publish({ type: 'done', text: `${totalReq.toLocaleString('en-IN')} requests, ${totalErr} errors` });
console.log('\n' + JSON.stringify(rows));
try {
  await prisma.travelRequest.deleteMany({ where: { title: 'Load test draft' } });
} catch (err) {
  console.warn('cleanup skipped:', err.message.split('\n').pop());
}
await prisma.$disconnect();
if (live) {
  const hold = Number(process.env.LIVE_HOLD_SECONDS || 900);
  console.log(`Live dashboard stays up for ${hold}s (Ctrl+C to stop).`);
  setTimeout(() => live.close().then(() => process.exit(0)), hold * 1000);
}
