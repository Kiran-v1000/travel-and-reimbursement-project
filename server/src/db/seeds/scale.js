/**
 * Scale data set: a 100,000-person functional org on top of the demo seed, plus a realistic
 * year of travel and expense history. For capacity / load testing ONLY - run it against a
 * separate database, never production.
 *
 *   DATABASE_URL=...scale_db npx prisma migrate deploy
 *   DATABASE_URL=...scale_db node src/db/seeds/seed.js
 *   DATABASE_URL=...scale_db node src/db/seeds/scale.js
 *
 * Org: CEO -> 10 BU heads -> 100 directors -> 1,000 managers -> 98,890 employees (~99 each).
 */
import { prisma } from '../pool.js';
import { rebuildOrgTree } from '../../shared/utils/orgTree.js';

const EMPLOYEES = 98_890;
const REPORTS = 200_000; // expense reports (3 lines each)
const TRIPS = 60_000;
const NOTIFICATIONS = 300_000;

const t0 = Date.now();
const step = (msg) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);
const run = (sql, ...params) => prisma.$executeRawUnsafe(sql, ...params);

async function main() {
  if (process.env.DATABASE_URL?.match(/\/travel_reimbursement(\?|$)/)) {
    throw new Error('Refusing to load scale data into the main database. Point DATABASE_URL at a separate scale database.');
  }
  if ((await prisma.user.count()) > 1000) {
    console.log('Scale data already present - nothing to do.');
    return;
  }
  const ceo = await prisma.user.findUnique({ where: { email: 'asha@voyage.io' } });
  const finance = await prisma.user.findUnique({ where: { email: 'sanjay@voyage.io' } });
  if (!ceo || !finance) throw new Error('Run the normal seed first (src/db/seeds/seed.js).');
  const depts = (await prisma.department.findMany({ select: { id: true } })).map((d) => d.id);
  const ccs = (await prisma.costCenter.findMany({ select: { id: true } })).map((c) => c.id);
  const cats = (await prisma.expenseCategory.findMany({ select: { id: true } })).map((c) => c.id);

  const users = (prefix, count, role, title, managerExpr) =>
    run(
      `INSERT INTO "User" (id, "employeeId", name, email, role, title, location, "departmentId", "costCenterId", "managerId", active, "createdAt", "updatedAt")
       SELECT '${prefix}-' || n, upper('${prefix}') || n, initcap('${prefix}') || ' ' || n, '${prefix}' || n || '@utthunga.com', '${role}'::"Role", '${title}',
              (ARRAY['Bengaluru','Mumbai','Chennai','Pune','Hyderabad'])[1 + n % 5], ($1::text[])[1 + n % cardinality($1::text[])], ($2::text[])[1 + n % cardinality($2::text[])],
              ${managerExpr}, true, now(), now()
       FROM generate_series(1, ${count}) n`,
      depts,
      ccs,
    );

  await users('bu', 10, 'MANAGER', 'Business Unit Head', `'${ceo.id}'`);
  await users('dir', 100, 'MANAGER', 'Director', `'bu-' || (1 + (n - 1) % 10)`);
  await users('mgr', 1000, 'MANAGER', 'Manager', `'dir-' || (1 + (n - 1) % 100)`);
  await users('emp', EMPLOYEES, 'EMPLOYEE', 'Engineer', `'mgr-' || (1 + (n - 1) % 1000)`);
  step(`users: ${await prisma.user.count()}`);
  await rebuildOrgTree();
  step('org tree (ancestors) rebuilt');

  // Expense reports: status mix 70% paid, 10% scheduled, 5% finance review, 5% pending, 5% draft, 5% returned.
  const statusExpr = `(CASE WHEN n % 20 < 14 THEN 'PAID' WHEN n % 20 < 16 THEN 'SCHEDULED' WHEN n % 20 = 16 THEN 'FINANCE_REVIEW' WHEN n % 20 = 17 THEN 'PENDING' WHEN n % 20 = 18 THEN 'DRAFT' ELSE 'RETURNED' END)`;
  await run(
    `INSERT INTO "ExpenseReport" (id, code, "employeeId", title, purpose, "costCenterId", currency, "totalBase", "policyFlags", status, round, version, "submittedAt", "approvedAt", "createdAt", "updatedAt")
     SELECT 'sx-' || n, 'SX-' || n, 'emp-' || (1 + (n - 1) % ${EMPLOYEES}), 'Client visit ' || n, 'Customer travel and meals', ($1::text[])[1 + n % cardinality($1::text[])],
            'INR', 0, CASE WHEN n % 13 = 0 THEN '[{"code":"MISSING_RECEIPT","severity":"violation","message":"Receipt missing"}]'::jsonb ELSE '[]'::jsonb END,
            ${statusExpr}::"ExpenseStatus", 1, 1, now() - ((n % 330) || ' days')::interval,
            CASE WHEN n % 20 < 17 THEN now() - ((n % 330) - 1 || ' days')::interval END, now() - ((n % 330) || ' days')::interval, now()
     FROM generate_series(1, ${REPORTS}) n`,
    ccs,
  );
  step('expense reports');
  await run(
    `INSERT INTO "ExpenseLine" (id, "reportId", date, "categoryId", merchant, amount, tax, currency, "fxRate", "fxDate", "baseAmount", "paymentMethod", flags, "createdAt", "updatedAt")
     SELECT 'sl-' || n || '-' || k, 'sx-' || n, (now() - ((n % 330) + k || ' days')::interval)::date, ($1::text[])[1 + (n + k) % cardinality($1::text[])],
            'Merchant ' || (n % 500), 200 + (n * 37 + k * 101) % 9000, 0, 'INR', 1, now(), 200 + (n * 37 + k * 101) % 9000, 'PERSONAL_CARD', '[]'::jsonb, now(), now()
     FROM generate_series(1, ${REPORTS}) n, generate_series(1, 3) k`,
    cats,
  );
  await run(`UPDATE "ExpenseReport" r SET "totalBase" = s.total FROM (SELECT "reportId", SUM("baseAmount") total FROM "ExpenseLine" WHERE "reportId" LIKE 'sx-%' GROUP BY 1) s WHERE r.id = s."reportId"`);
  step(`expense lines: ${await prisma.expenseLine.count()}`);

  // Approval steps: decided ones for reports past manager approval, pending ones (some overdue) for PENDING.
  await run(
    `INSERT INTO "ApprovalStep" (id, "entityType", "expenseReportId", round, level, label, "approverId", "actedById", status, comment, "ruleName", "ruleVersion", "activatedAt", "actedAt", "dueAt", "createdAt")
     SELECT 'ss-' || r.id, 'EXPENSE', r.id, 1, 1, 'Reporting manager', u."managerId",
            CASE WHEN r.status::text = 'PENDING' THEN NULL ELSE u."managerId" END,
            (CASE WHEN r.status::text = 'PENDING' THEN 'PENDING' WHEN r.status::text = 'RETURNED' THEN 'RETURNED' ELSE 'APPROVED' END)::"StepStatus",
            CASE WHEN r.status::text = 'RETURNED' THEN 'Please attach receipts' END, 'Standard expense report', 1,
            r."submittedAt", CASE WHEN r.status::text <> 'PENDING' THEN r."submittedAt" + interval '1 day' END,
            CASE WHEN r.status::text = 'PENDING' THEN now() + ((hashtext(r.id) % 72) || ' hours')::interval END, r."submittedAt"
     FROM "ExpenseReport" r JOIN "User" u ON u.id = r."employeeId"
     WHERE r.id LIKE 'sx-%' AND r.status::text <> 'DRAFT'`,
  );
  await run(
    `INSERT INTO "Payment" (id, "reportId", method, amount, currency, "scheduledFor", "paidAt", reference, status, "recordedById", "createdAt", "updatedAt")
     SELECT 'sp-' || r.id, r.id, 'BANK_TRANSFER', r."totalBase", 'INR', r."approvedAt" + interval '3 days',
            CASE WHEN r.status::text = 'PAID' THEN r."approvedAt" + interval '4 days' END, CASE WHEN r.status::text = 'PAID' THEN 'UTR' || abs(hashtext(r.id)) END,
            (CASE WHEN r.status::text = 'PAID' THEN 'PAID' ELSE 'SCHEDULED' END)::"PaymentStatus", $1, now(), now()
     FROM "ExpenseReport" r WHERE r.id LIKE 'sx-%' AND r.status::text IN ('PAID', 'SCHEDULED')`,
    finance.id,
  );
  step('expense approval steps + payments');

  await run(
    `INSERT INTO "TravelRequest" (id, code, "requesterId", title, purpose, "travelType", origin, destination, "startDate", "endDate", travelers, "estTransport", "estLodging", "estMeals", "estOther",
                                  currency, "estTotalBase", "costCenterId", "policyFlags", status, round, version, "submittedAt", "createdAt", "updatedAt")
     SELECT 'st-' || n, 'ST-' || n, 'emp-' || (1 + (n * 7) % ${EMPLOYEES}), 'Customer workshop ' || n, 'Workshop with customer engineering team',
            (CASE WHEN n % 10 = 0 THEN 'INTERNATIONAL' ELSE 'DOMESTIC' END)::"TravelType", 'Bengaluru', (ARRAY['Mumbai','Delhi','Pune','Chennai','Singapore'])[1 + n % 5],
            (now() + (((n % 120) - 60) || ' days')::interval)::date, (now() + (((n % 120) - 57) || ' days')::interval)::date, ARRAY['Traveler'],
            6000, 12000, 4000, 1000, 'INR', 23000, ($1::text[])[1 + n % cardinality($1::text[])], '[]'::jsonb,
            (CASE WHEN n % 10 < 6 THEN 'APPROVED' WHEN n % 10 = 6 THEN 'PENDING' WHEN n % 10 = 7 THEN 'DRAFT' WHEN n % 10 = 8 THEN 'REJECTED' ELSE 'WITHDRAWN' END)::"TravelStatus",
            1, 1, now() - ((n % 200) || ' days')::interval, now() - ((n % 200) || ' days')::interval, now()
     FROM generate_series(1, ${TRIPS}) n`,
    ccs,
  );
  await run(
    `INSERT INTO "ApprovalStep" (id, "entityType", "travelRequestId", round, level, label, "approverId", status, "ruleName", "ruleVersion", "activatedAt", "dueAt", "createdAt")
     SELECT 'sts-' || t.id, 'TRAVEL', t.id, 1, 1, 'Reporting manager', u."managerId", 'PENDING', 'Standard travel', 1, t."submittedAt",
            now() + ((hashtext(t.id) % 72) || ' hours')::interval, t."submittedAt"
     FROM "TravelRequest" t JOIN "User" u ON u.id = t."requesterId" WHERE t.id LIKE 'st-%' AND t.status::text = 'PENDING'`,
  );
  step(`travel requests: ${await prisma.travelRequest.count()}`);

  await run(
    `INSERT INTO "Notification" (id, "userId", type, title, body, link, read, "createdAt")
     SELECT 'sn-' || n, 'emp-' || (1 + (n - 1) % ${EMPLOYEES}), 'PROGRESS', 'Update on SX-' || n, 'Your claim moved forward.', '/expenses', n % 4 <> 0,
            now() - ((n % 200) || ' days')::interval
     FROM generate_series(1, ${NOTIFICATIONS}) n`,
  );
  step('notifications');
  await run('ANALYZE');
  step('done - statistics refreshed');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
