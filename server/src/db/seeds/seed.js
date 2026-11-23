/**
 * Demo seed. Builds reference data, an org hierarchy, approval rules and a set of
 * travel requests / expense reports that run through the real services so the
 * approval steps, notifications and hash-chained audit trail are all genuine.
 *
 * Refuses to run against a database that already has users (no accidental wipes).
 * Usage: npm run db:seed        (or: npm run db:reset, which re-migrates then seeds)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../pool.js';
import { env } from '../../config/env.js';
import * as travel from '../../modules/travel/travel.service.js';
import * as expenses from '../../modules/expenses/expenses.service.js';
import * as approvals from '../../modules/approvals/approvals.service.js';
import * as finance from '../../modules/finance/finance.service.js';
import { createDelegation } from '../../modules/users/users.service.js';
import { audit } from '../../modules/audit/audit.service.js';
import { rebuildOrgTree } from '../../shared/utils/orgTree.js';

const PASSWORD = 'Voyage@123';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@utthunga.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'admin@123';
const DAY = 86400000;
const daysFromNow = (n) => new Date(Date.now() + n * DAY);
const dateOnly = (d) => new Date(d.toISOString().slice(0, 10));

/**
 * Functional hierarchy: very large requests go all the way up the reporting line to the CEO.
 * Priorities sit above the trip-type rules; the exception variants keep the CEO step for
 * out-of-policy requests too (exception rules are always chosen first).
 */
export const CEO_THRESHOLD = 500000;
export function ceoRules(L) {
  return [
    { name: 'CEO approval: travel ₹5,00,000+ (exception)', entityType: 'TRAVEL', priority: 4, minAmount: CEO_THRESHOLD, onPolicyException: true, levels: [L.manager, L.head, L.finance, L.ceo] },
    { name: 'CEO approval: travel ₹5,00,000+', entityType: 'TRAVEL', priority: 8, minAmount: CEO_THRESHOLD, levels: [L.manager, L.head, L.finance, L.ceo] },
    { name: 'CEO approval: expenses ₹5,00,000+ (exception)', entityType: 'EXPENSE', priority: 4, minAmount: CEO_THRESHOLD, onPolicyException: true, levels: [L.manager, L.head, L.ceo] },
    { name: 'CEO approval: expenses ₹5,00,000+', entityType: 'EXPENSE', priority: 8, minAmount: CEO_THRESHOLD, levels: [L.manager, L.head, L.ceo] },
  ];
}

async function main() {
  if ((await prisma.user.count()) > 0) {
    console.log('Database already has users - skipping seed. Run "npm run db:reset" for a clean demo database.');
    return;
  }
  console.log('Seeding reference data...');

  const currencies = [
    ['INR', 'Indian Rupee', '₹', 1],
    ['USD', 'US Dollar', '$', 83.2],
    ['EUR', 'Euro', '€', 90.1],
    ['GBP', 'British Pound', '£', 105.4],
    ['SGD', 'Singapore Dollar', 'S$', 61.8],
    ['AED', 'UAE Dirham', 'AED', 22.65],
    ['JPY', 'Japanese Yen', '¥', 0.56],
  ];
  for (const [code, name, symbol, rateToBase] of currencies) await prisma.currency.create({ data: { code, name, symbol, rateToBase } });

  const cats = {};
  for (const c of [
    ['AIRFARE', 'Airfare', 'plane', null, 0],
    ['RAIL', 'Train & bus', 'train', 10000, 300],
    ['LODGING', 'Hotel & lodging', 'bed', 25000, 0],
    ['MEALS', 'Meals', 'utensils', 3000, 500],
    ['TAXI', 'Taxi & local transport', 'car', 5000, 300],
    ['VISA', 'Visa & travel fees', 'stamp', null, 0],
    ['CLIENT', 'Client entertainment', 'wine', 10000, 500],
    ['INTERNET', 'Phone & internet', 'wifi', 2000, 500],
    ['MISC', 'Other business expense', 'receipt', 5000, 500],
  ]) {
    cats[c[0]] = await prisma.expenseCategory.create({ data: { code: c[0], name: c[1], icon: c[2], perItemLimit: c[3], receiptThreshold: c[4] } });
  }

  const cc = {};
  for (const [code, name] of [['CC-100', 'Corporate'], ['CC-210', 'Engineering R&D'], ['CC-310', 'Sales - West'], ['CC-320', 'Sales - International'], ['CC-410', 'Finance & Accounts']]) {
    cc[code] = await prisma.costCenter.create({ data: { code, name } });
  }
  const dept = {};
  for (const [code, name] of [['EXEC', 'Leadership'], ['ENG', 'Engineering'], ['SALES', 'Sales'], ['FIN', 'Finance'], ['OPS', 'Operations']]) {
    dept[code] = await prisma.department.create({ data: { code, name } });
  }

  console.log('Seeding people...');
  const hash = await bcrypt.hash(PASSWORD, 10);
  const mk = (employeeId, name, email, role, title, d, c, managerId, location = 'Bengaluru') =>
    prisma.user.create({ data: { employeeId, name, email, role, title, departmentId: dept[d].id, costCenterId: cc[c].id, managerId, location, passwordHash: hash } });

  const asha = await mk('E1001', 'Asha Rao', 'asha@voyage.io', 'MANAGER', 'Chief Executive Officer', 'EXEC', 'CC-100', null);
  const vikram = await mk('E1002', 'Vikram Iyer', 'vikram@voyage.io', 'MANAGER', 'Director, Engineering', 'ENG', 'CC-210', asha.id);
  const arjun = await mk('E1003', 'Arjun Shah', 'arjun@voyage.io', 'MANAGER', 'Head of Sales', 'SALES', 'CC-310', asha.id, 'Mumbai');
  const meera = await mk('E1004', 'Meera Pillai', 'meera@voyage.io', 'FINANCE', 'Finance Controller', 'FIN', 'CC-410', asha.id);
  // Local administrator (password sign-in). Everyone else at the company signs in with Microsoft SSO.
  const divya = await prisma.user.update({
    where: { id: (await mk('E1005', 'Divya Kulkarni', ADMIN_EMAIL, 'ADMIN', 'Travel & Systems Administrator', 'OPS', 'CC-100', asha.id)).id },
    data: { passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10) },
  });
  const neha = await mk('E1010', 'Neha Kapoor', 'neha@voyage.io', 'MANAGER', 'Engineering Manager', 'ENG', 'CC-210', vikram.id);
  const sanjay = await mk('E1011', 'Sanjay Gupta', 'sanjay@voyage.io', 'FINANCE', 'Finance Analyst', 'FIN', 'CC-410', meera.id);
  const rahul = await mk('E1020', 'Rahul Menon', 'rahul@voyage.io', 'EMPLOYEE', 'Senior Software Engineer', 'ENG', 'CC-210', neha.id);
  const ananya = await mk('E1021', 'Ananya Das', 'ananya@voyage.io', 'EMPLOYEE', 'Product Designer', 'ENG', 'CC-210', neha.id);
  const priya = await mk('E1030', 'Priya Nair', 'priya@voyage.io', 'EMPLOYEE', 'Account Executive', 'SALES', 'CC-320', arjun.id, 'Mumbai');
  const ravi = await mk('E1040', 'Ravi Verma', 'auditor@voyage.io', 'AUDITOR', 'Internal Auditor', 'FIN', 'CC-410', meera.id);

  await prisma.department.update({ where: { id: dept.EXEC.id }, data: { headId: asha.id } });
  await prisma.department.update({ where: { id: dept.ENG.id }, data: { headId: vikram.id } });
  await prisma.department.update({ where: { id: dept.SALES.id }, data: { headId: arjun.id } });
  await prisma.department.update({ where: { id: dept.FIN.id }, data: { headId: meera.id } });
  await prisma.department.update({ where: { id: dept.OPS.id }, data: { headId: divya.id } });
  await rebuildOrgTree();

  const settings = {
    baseCurrency: 'INR', leadDaysDomestic: 7, leadDaysInternational: 21, maxTripDays: 30,
    lodgingCapDomestic: 8000, lodgingCapInternational: 22000, mealsPerDiem: 2500,
    submissionDeadlineDays: 60, estimateTolerancePct: 10, approvalTimeoutHours: 48, escalationEnabled: true,
    resubmitRule: 'RESTART', fallbackApproverId: divya.id, emailNotifications: true, retentionYears: 8,
    roleApprovers: { FINANCE: meera.id },
  };
  for (const [key, value] of Object.entries(settings)) await prisma.setting.create({ data: { key, value } });

  console.log('Seeding approval rules...');
  const L = {
    manager: { label: 'Reporting manager', approvers: [{ type: 'MANAGER' }] },
    skip: { label: 'Skip-level manager', approvers: [{ type: 'SKIP_MANAGER' }] },
    head: { label: 'Department head', approvers: [{ type: 'DEPT_HEAD' }] },
    finance: { label: 'Finance controller', approvers: [{ type: 'ROLE', role: 'FINANCE' }] },
    ceo: { label: 'CEO', approvers: [{ type: 'TOP_OF_LINE' }] },
  };
  const rules = [
    ...ceoRules(L),
    { name: 'Travel policy exception', entityType: 'TRAVEL', priority: 5, onPolicyException: true, levels: [L.manager, L.head, L.finance] },
    { name: 'International travel', entityType: 'TRAVEL', priority: 10, travelType: 'INTERNATIONAL', levels: [L.manager, L.head, L.finance] },
    { name: 'High-value domestic travel', entityType: 'TRAVEL', priority: 20, travelType: 'DOMESTIC', minAmount: 75000, levels: [L.manager, L.skip] },
    { name: 'Standard travel', entityType: 'TRAVEL', priority: 100, levels: [L.manager] },
    { name: 'Expense policy exception', entityType: 'EXPENSE', priority: 5, onPolicyException: true, levels: [L.manager, L.head] },
    { name: 'High-value expense report', entityType: 'EXPENSE', priority: 20, minAmount: 50000, levels: [L.manager, L.head] },
    { name: 'Standard expense report', entityType: 'EXPENSE', priority: 100, levels: [L.manager] },
  ];
  for (const r of rules) await prisma.approvalRule.create({ data: r });
  await audit(divya, 'system.seeded', 'SYSTEM', null, { rules: rules.length, users: 11 });

  // ---------- Historical paid claims for charts ----------
  console.log('Seeding history...');
  const uploadDir = path.resolve(env.UPLOAD_DIR);
  fs.mkdirSync(uploadDir, { recursive: true });
  const receipt = async (lineId, name, userId) => {
    const storedName = `${crypto.randomUUID()}.pdf`;
    fs.writeFileSync(path.join(uploadDir, storedName), `%PDF-1.4\n% Demo receipt: ${name}\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`);
    await prisma.attachment.create({ data: { originalName: name, storedName, mimeType: 'application/pdf', size: 120, uploadedById: userId, expenseLineId: lineId } });
  };

  const history = [
    [rahul, 5, 'Customer onsite - Pune', [['TAXI', 'Uber', 1850], ['LODGING', 'Courtyard Pune', 14200], ['MEALS', 'Hotel restaurant', 2100]]],
    [priya, 5, 'Client meetings - Delhi', [['AIRFARE', 'IndiGo', 11800], ['LODGING', 'Taj Palace', 21000], ['CLIENT', 'Indian Accent', 8600]]],
    [ananya, 4, 'Design conference - Goa', [['AIRFARE', 'Air India', 9400], ['LODGING', 'W Goa', 18500], ['MEALS', 'Conference dinner', 1900]]],
    [rahul, 3, 'Hackathon travel - Hyderabad', [['RAIL', 'IRCTC', 2400], ['LODGING', 'Novotel HICC', 12800], ['TAXI', 'Ola', 1300]]],
    [priya, 3, 'Trade show - Singapore', [['AIRFARE', 'Singapore Airlines', 48500], ['LODGING', 'Marina Bay Hotel', 24500], ['MEALS', 'Lau Pa Sat', 2600]]],
    [neha, 2, 'Team offsite planning', [['TAXI', 'Uber', 950], ['MEALS', 'Toit', 2800], ['MISC', 'Printing', 1200]]],
    [arjun, 2, 'Partner summit - Dubai', [['AIRFARE', 'Emirates', 38500], ['LODGING', 'Address Downtown', 23800], ['CLIENT', 'Zuma Dubai', 9800]]],
    [ananya, 1, 'User research visits', [['TAXI', 'Rapido', 680], ['MEALS', 'Cafe Coffee Day', 940], ['INTERNET', 'Airtel data pack', 899]]],
    [rahul, 1, 'Cloud migration workshop', [['RAIL', 'Vande Bharat', 1650], ['LODGING', 'Lemon Tree', 7400], ['MEALS', 'Saravana Bhavan', 1100]]],
  ];
  const reviewers = { [rahul.id]: neha, [ananya.id]: neha, [priya.id]: arjun, [neha.id]: vikram, [arjun.id]: asha };
  let n = 0;
  for (const [emp, monthsAgo, title, lines] of history) {
    n += 1;
    const when = new Date();
    when.setMonth(when.getMonth() - monthsAgo, 8 + n);
    const total = lines.reduce((a, l) => a + l[2], 0);
    const code = `EX-${when.getFullYear()}-H${String(n).padStart(3, '0')}`;
    const report = await prisma.expenseReport.create({
      data: {
        code, employeeId: emp.id, title, purpose: `${title} - business travel and client work`, costCenterId: emp.costCenterId, currency: 'INR',
        totalBase: total, status: 'PAID', round: 1, submittedAt: when, approvedAt: new Date(when.getTime() + DAY), ruleName: 'Standard expense report', ruleVersion: 1,
        createdAt: when,
      },
    });
    for (const [i, [cat, merchant, amount]] of lines.entries()) {
      const line = await prisma.expenseLine.create({
        data: { reportId: report.id, date: dateOnly(new Date(when.getTime() - (3 - i) * DAY)), categoryId: cats[cat].id, merchant, amount, baseAmount: amount, currency: 'INR', paymentMethod: 'PERSONAL_CARD' },
      });
      await receipt(line.id, `${merchant.replace(/\s+/g, '-').toLowerCase()}-receipt.pdf`, emp.id);
    }
    await prisma.approvalStep.create({
      data: { entityType: 'EXPENSE', expenseReportId: report.id, round: 1, level: 1, label: 'Reporting manager', approverId: reviewers[emp.id].id, actedById: reviewers[emp.id].id, status: 'APPROVED', comment: 'Looks good.', ruleName: 'Standard expense report', ruleVersion: 1, activatedAt: when, actedAt: new Date(when.getTime() + DAY) },
    });
    await prisma.payment.create({
      data: { reportId: report.id, method: 'BANK_TRANSFER', amount: total, currency: 'INR', scheduledFor: new Date(when.getTime() + 4 * DAY), paidAt: new Date(when.getTime() + 5 * DAY), reference: `UTR${String(240000 + n * 137)}`, status: 'PAID', recordedById: sanjay.id },
    });
  }

  // ---------- Live workflow through the real services ----------
  console.log('Running live workflows...');

  // 1) Rahul - international trip, three sequential approvals, fully approved.
  const munich = await travel.create(rahul, {
    title: 'Hannover Messe & customer visit', purpose: 'Present the IIoT gateway roadmap at Hannover Messe and run an architecture workshop with a key customer in Munich.',
    travelType: 'INTERNATIONAL', origin: 'Bengaluru', destination: 'Hannover, Munich (Germany)', startDate: dateOnly(daysFromNow(35)), endDate: dateOnly(daysFromNow(42)),
    travelers: ['Rahul Menon'], estTransport: 1650, estLodging: 1400, estMeals: 420, estOther: 180, currency: 'EUR', costCenterId: cc['CC-210'].id, projectCode: 'PRJ-IIOT-24',
  });
  await travel.submit(rahul, munich.id, {});
  for (const approver of [neha, vikram, meera]) {
    const [step] = await approvals.inbox(approver);
    await approvals.act(approver, step.id, 'APPROVED', approver === meera ? 'Within budget for Q4 events.' : 'Approved - important customer engagement.');
  }

  // 2) Rahul - completed domestic trip with a linked expense report going to Finance.
  const chennai = await travel.create(rahul, {
    title: 'Plant commissioning - Chennai', purpose: 'Commission the edge controllers at the Chennai plant and train the operations team.',
    travelType: 'DOMESTIC', origin: 'Bengaluru', destination: 'Chennai', startDate: dateOnly(daysFromNow(12)), endDate: dateOnly(daysFromNow(15)),
    travelers: ['Rahul Menon'], estTransport: 6500, estLodging: 21000, estMeals: 7000, estOther: 2000, currency: 'INR', costCenterId: cc['CC-210'].id, projectCode: 'PRJ-EDGE-11',
  });
  await travel.submit(rahul, chennai.id, {});
  {
    const [step] = await approvals.inbox(neha);
    await approvals.act(neha, step.id, 'APPROVED', 'Go ahead.');
  }
  // Move the approved trip into the past so it can be claimed (demo only).
  await prisma.travelRequest.update({ where: { id: chennai.id }, data: { startDate: dateOnly(daysFromNow(-12)), endDate: dateOnly(daysFromNow(-9)) } });

  const chennaiClaim = await expenses.create(rahul, { title: 'Chennai plant commissioning', purpose: 'Travel, stay and meals for the Chennai commissioning visit.', travelRequestId: chennai.id, costCenterId: cc['CC-210'].id, projectCode: 'PRJ-EDGE-11' });
  for (const [cat, merchant, amount, off, desc] of [
    ['RAIL', 'IRCTC - Shatabdi', 1890, -12, 'Bengaluru to Chennai'],
    ['LODGING', 'Hyatt Regency Chennai', 19800, -9, '3 nights'],
    ['TAXI', 'Uber', 2240, -11, 'Hotel to plant (multiple)'],
    ['MEALS', 'Dakshin', 2650, -10, 'Team dinner with plant engineers'],
    ['RAIL', 'IRCTC - Shatabdi', 1890, -9, 'Chennai to Bengaluru'],
  ]) {
    const line = await expenses.addLine(rahul, chennaiClaim.id, { date: dateOnly(daysFromNow(off)), categoryId: cats[cat].id, merchant, description: desc, amount, tax: 0, currency: 'INR', paymentMethod: 'PERSONAL_CARD' });
    await receipt(line.id, `${merchant.split(' ')[0].toLowerCase()}-${Math.abs(off)}.pdf`, rahul.id);
  }
  await expenses.recalc(chennaiClaim.id);
  await expenses.submit(rahul, chennaiClaim.id, {});
  {
    const [step] = await approvals.inbox(neha);
    await approvals.act(neha, step.id, 'APPROVED', 'All receipts attached, thanks.');
  }

  // 3) Ananya - claim approved and scheduled for payment by Finance.
  const ananyaClaim = await expenses.create(ananya, { title: 'Customer interviews - Bengaluru', purpose: 'Local travel and meals for usability interviews with three customers.', costCenterId: cc['CC-210'].id });
  for (const [cat, merchant, amount, off] of [['TAXI', 'Uber', 1420, -6], ['MEALS', 'Third Wave Coffee', 860, -5], ['TAXI', 'Ola', 990, -4]]) {
    const line = await expenses.addLine(ananya, ananyaClaim.id, { date: dateOnly(daysFromNow(off)), categoryId: cats[cat].id, merchant, amount, tax: 0, currency: 'INR', paymentMethod: 'UPI' });
    await receipt(line.id, `${merchant.split(' ')[0].toLowerCase()}.pdf`, ananya.id);
  }
  await expenses.recalc(ananyaClaim.id);
  await expenses.submit(ananya, ananyaClaim.id, {});
  {
    const [step] = await approvals.inbox(neha);
    await approvals.act(neha, step.id, 'APPROVED', 'Approved.');
  }
  await finance.decide(sanjay, ananyaClaim.id, { action: 'APPROVE', method: 'BANK_TRANSFER', scheduledFor: dateOnly(daysFromNow(2)), comment: 'Next payout run.' });

  // 4) Priya - expense returned for missing receipt; travel pending with her manager.
  const priyaClaim = await expenses.create(priya, { title: 'Client lunch & local travel - Mumbai', purpose: 'Quarterly business review with a key banking customer.', costCenterId: cc['CC-320'].id, projectCode: 'ACC-HDFC' });
  await expenses.addLine(priya, priyaClaim.id, { date: dateOnly(daysFromNow(-8)), categoryId: cats.CLIENT.id, merchant: 'The Bombay Canteen', description: 'Lunch with 3 client stakeholders', amount: 7800, tax: 0, currency: 'INR', paymentMethod: 'PERSONAL_CARD' });
  const taxi = await expenses.addLine(priya, priyaClaim.id, { date: dateOnly(daysFromNow(-8)), categoryId: cats.TAXI.id, merchant: 'Uber', amount: 640, tax: 0, currency: 'INR', paymentMethod: 'UPI' });
  await receipt(taxi.id, 'uber-trip.pdf', priya.id);
  await expenses.recalc(priyaClaim.id);
  await expenses.submit(priya, priyaClaim.id, { exceptionReason: 'Restaurant receipt was handed to the client; requesting a duplicate copy.' });
  {
    const [step] = await approvals.inbox(arjun);
    await approvals.act(arjun, step.id, 'RETURNED', 'Please attach the restaurant receipt or a duplicate copy before I can approve.');
  }

  const singapore = await travel.create(priya, {
    title: 'Fintech Festival - Singapore', purpose: 'Meet three prospective banking clients and attend partner briefings at Singapore Fintech Festival.',
    travelType: 'INTERNATIONAL', origin: 'Mumbai', destination: 'Singapore', startDate: dateOnly(daysFromNow(28)), endDate: dateOnly(daysFromNow(32)),
    travelers: ['Priya Nair'], estTransport: 820, estLodging: 1150, estMeals: 300, estOther: 150, currency: 'SGD', costCenterId: cc['CC-320'].id, projectCode: 'MKT-SFF',
  });
  await travel.submit(priya, singapore.id, {});

  // 5) Ananya - domestic trip pending with Neha; a policy exception (short notice).
  const delhi = await travel.create(ananya, {
    title: 'Urgent design review - Delhi', purpose: 'Joint design review with the customer product team before their board demo.',
    travelType: 'DOMESTIC', origin: 'Bengaluru', destination: 'New Delhi', startDate: dateOnly(daysFromNow(3)), endDate: dateOnly(daysFromNow(4)),
    travelers: ['Ananya Das'], estTransport: 12400, estLodging: 9500, estMeals: 3000, estOther: 1000, currency: 'INR', costCenterId: cc['CC-210'].id,
  });
  await travel.submit(ananya, delhi.id, { exceptionReason: 'Customer moved the board demo forward; the review must happen this week.' });

  // 6) Neha - high-value trip waiting for Vikram; Rahul has a draft.
  const neTrip = await travel.create(neha, {
    title: 'Engineering leadership summit - Hyderabad', purpose: 'Represent the platform team at the annual engineering leadership summit and hiring drive.',
    travelType: 'DOMESTIC', origin: 'Bengaluru', destination: 'Hyderabad', startDate: dateOnly(daysFromNow(18)), endDate: dateOnly(daysFromNow(20)),
    travelers: ['Neha Kapoor', 'Rahul Menon'], estTransport: 14000, estLodging: 15000, estMeals: 6000, estOther: 3000, currency: 'INR', costCenterId: cc['CC-210'].id,
  });
  await travel.submit(neha, neTrip.id, {});

  const draft = await expenses.create(rahul, { title: 'Home office internet - this month', purpose: 'Broadband used for on-call support rotation.', costCenterId: cc['CC-210'].id });
  await expenses.addLine(rahul, draft.id, { date: dateOnly(daysFromNow(-2)), categoryId: cats.INTERNET.id, merchant: 'ACT Fibernet', amount: 1179, tax: 0, currency: 'INR', paymentMethod: 'UPI' });

  // 7) An active delegation: Arjun is travelling, Asha covers his approvals.
  await createDelegation(arjun, { delegateId: asha.id, scope: 'ALL', startDate: dateOnly(daysFromNow(-1)), endDate: dateOnly(daysFromNow(6)), reason: 'Customer visits in the Middle East' });

  console.log('\nSeed complete. Sign in with any of these (password: %s):', PASSWORD);
  console.table([
    ['Employee', 'rahul@voyage.io'], ['Employee', 'ananya@voyage.io'], ['Employee', 'priya@voyage.io'],
    ['Manager', 'neha@voyage.io'], ['Director / dept head', 'vikram@voyage.io'], ['Sales head', 'arjun@voyage.io'], ['CEO', 'asha@voyage.io'],
    ['Finance', 'meera@voyage.io'], ['Finance', 'sanjay@voyage.io'], ['Auditor', 'auditor@voyage.io'],
  ].map(([role, email]) => ({ role, email })));
  console.log('Administrator: %s (password: %s) - change it after first sign-in.', ADMIN_EMAIL, ADMIN_PASSWORD);
  void ravi;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
