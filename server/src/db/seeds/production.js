/**
 * Production bootstrap. Creates ONLY what a fresh installation needs - no demo people,
 * no sample requests, no shared passwords:
 *   - currencies, expense categories, default policy settings, default approval rules
 *   - one starter department + cost center (only when none exist yet)
 *   - the first administrator, from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD, who must
 *     change that password at first sign-in
 *
 * Safe to run more than once: it only adds what is missing and never overwrites changes
 * an administrator has made.
 *
 *   SEED_ADMIN_EMAIL=it.admin@utthunga.com SEED_ADMIN_PASSWORD='...' npm run db:seed:prod
 *
 * Everyone else arrives through Microsoft sign-in or Administration → People → Import CSV.
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../pool.js';
import { audit } from '../../modules/audit/audit.service.js';
import { rebuildOrgTree } from '../../shared/utils/orgTree.js';
import { CURRENCIES, CATEGORIES, DEFAULT_SETTINGS, defaultRules, passwordProblem } from './reference-data.js';

const log = (msg) => console.log(`  ${msg}`);

async function main() {
  const email = String(process.env.SEED_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Set SEED_ADMIN_EMAIL to the first administrator\'s work email.');
  // Validate everything before writing anything.
  if (!(await prisma.user.findUnique({ where: { email } }))) {
    const problem = passwordProblem(password);
    if (problem) throw new Error(`SEED_ADMIN_PASSWORD must have ${problem}.`);
  }

  console.log('Bootstrapping Voyage...');

  let n = 0;
  for (const [code, name, symbol, rateToBase] of CURRENCIES) {
    if (!(await prisma.currency.findUnique({ where: { code } }))) { await prisma.currency.create({ data: { code, name, symbol, rateToBase } }); n++; }
  }
  log(`currencies: ${n} added`);

  n = 0;
  for (const [code, name, icon, perItemLimit, receiptThreshold, glAccount] of CATEGORIES) {
    if (!(await prisma.expenseCategory.findUnique({ where: { code } }))) { await prisma.expenseCategory.create({ data: { code, name, icon, perItemLimit, receiptThreshold, glAccount } }); n++; }
  }
  log(`expense categories: ${n} added`);

  if ((await prisma.department.count()) === 0) { await prisma.department.create({ data: { code: 'ADMIN', name: 'Administration' } }); log('department ADMIN added'); }
  if ((await prisma.costCenter.count()) === 0) { await prisma.costCenter.create({ data: { code: 'CC-100', name: 'Corporate' } }); log('cost center CC-100 added'); }

  let admin = await prisma.user.findUnique({ where: { email } });
  if (!admin) {
    const dept = await prisma.department.findFirst({ orderBy: { createdAt: 'asc' } });
    const cc = await prisma.costCenter.findFirst({ orderBy: { createdAt: 'asc' } });
    admin = await prisma.user.create({
      data: {
        email,
        name: process.env.SEED_ADMIN_NAME || 'Voyage Administrator',
        employeeId: process.env.SEED_ADMIN_EMPLOYEE_ID || 'ADMIN-001',
        role: 'ADMIN',
        title: 'System Administrator',
        departmentId: dept?.id,
        costCenterId: cc?.id,
        passwordHash: await bcrypt.hash(password, 12),
        mustChangePassword: true,
      },
    });
    await rebuildOrgTree();
    log(`administrator ${email} created (must change password at first sign-in)`);
  } else {
    log(`administrator ${email} already exists - left unchanged`);
  }

  n = 0;
  const settings = { ...DEFAULT_SETTINGS, fallbackApproverId: admin.id };
  for (const [key, value] of Object.entries(settings)) {
    if (!(await prisma.setting.findUnique({ where: { key } }))) { await prisma.setting.create({ data: { key, value } }); n++; }
  }
  log(`policy settings: ${n} added`);

  if ((await prisma.approvalRule.count()) === 0) {
    const rules = defaultRules();
    for (const r of rules) await prisma.approvalRule.create({ data: r });
    log(`approval rules: ${rules.length} added`);
  } else {
    log('approval rules already configured - left unchanged');
  }

  await audit(admin, 'system.bootstrapped', 'SYSTEM', null, { admin: email });
  console.log('Done. Sign in as the administrator, change the password, then import people or switch on Microsoft sign-in.');
}

main()
  .catch((err) => {
    console.error(`Bootstrap failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
