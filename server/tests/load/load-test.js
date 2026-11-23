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
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env.js';
import { prisma } from '../../src/db/pool.js';

const TARGET = process.env.TARGET || 'http://localhost:4011';
const DURATION = Number(process.env.DURATION || 15);

const token = (u) => `tr_session=${jwt.sign({ sub: u.id, role: u.role }, env.JWT_SECRET, { expiresIn: '1h' })}`;
const pool = async (where, take) => (await prisma.user.findMany({ where, select: { id: true, role: true }, take })).map(token);

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
  { name: 'BU head: analytics (~10,000 people)', path: '/api/reports/analytics', who: buHeads, connections: 10 },
  { name: 'CEO: analytics (100,000 people)', path: '/api/reports/analytics', who: ceo, connections: 5 },
  { name: 'Finance: review queue', path: '/api/finance/queue', who: finance, connections: 20 },
  { name: 'Anyone: people search', path: '/api/users/directory?search=emp1234', who: employees, connections: 50 },
  { name: 'Admin: people list page 500', path: '/api/users?page=500&pageSize=50', who: admin, connections: 10 },
];

const rows = [];
for (const s of scenarios) {
  const result = await autocannon({
    url: TARGET + s.path,
    method: s.method ?? 'GET',
    connections: s.connections,
    duration: DURATION,
    headers: { 'content-type': 'application/json' },
    body: s.body,
    requests: [{ setupRequest: (req) => ({ ...req, headers: { ...req.headers, cookie: pick(s.who) } }) }],
  });
  const row = {
    scenario: s.name,
    'req/s': Math.round(result.requests.average),
    'p50 ms': result.latency.p50,
    'p97.5 ms': result.latency.p97_5,
    'p99 ms': result.latency.p99,
    errors: result.errors + result.timeouts + result.non2xx,
  };
  rows.push(row);
  console.log(`${row.scenario.padEnd(46)} ${String(row['req/s']).padStart(6)} req/s  p50 ${row['p50 ms']}ms  p99 ${row['p99 ms']}ms  errors ${row.errors}`);
}
console.log('\n' + JSON.stringify(rows));
try {
  await prisma.travelRequest.deleteMany({ where: { title: 'Load test draft' } });
} catch (err) {
  console.warn('cleanup skipped:', err.message.split('\n').pop());
}
await prisma.$disconnect();
