import { prisma } from '../../db/pool.js';
import { notFound, badRequest } from '../../shared/errors/AppError.js';
import { getSettings } from '../../shared/utils/index.js';
import { audit } from '../audit/audit.service.js';
import { previewRoute } from '../approvals/approvals.preview.js';

// ---------- Reference data (any signed-in user) ----------
export async function reference() {
  const [categories, currencies, costCenters, departments, settings] = await Promise.all([
    prisma.expenseCategory.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.currency.findMany({ where: { active: true }, orderBy: { code: 'asc' } }),
    prisma.costCenter.findMany({ where: { active: true }, orderBy: { code: 'asc' } }),
    prisma.department.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, code: true } }),
    getSettings(),
  ]);
  const publicKeys = ['baseCurrency', 'leadDaysDomestic', 'leadDaysInternational', 'maxTripDays', 'lodgingCapDomestic', 'lodgingCapInternational', 'mealsPerDiem', 'submissionDeadlineDays', 'estimateTolerancePct'];
  return { categories, currencies, costCenters, departments, settings: Object.fromEntries(publicKeys.map((k) => [k, settings[k]])) };
}

// ---------- Approval rules (versioned) ----------
export const listRules = () =>
  prisma.approvalRule.findMany({ include: { department: { select: { name: true } } }, orderBy: [{ entityType: 'asc' }, { priority: 'asc' }] });

export async function createRule(actor, data) {
  const rule = await prisma.approvalRule.create({ data });
  await audit(actor, 'rule.created', 'RULE', rule.id, { name: rule.name, version: 1, levels: rule.levels });
  return rule;
}

export async function updateRule(actor, id, data) {
  const existing = await prisma.approvalRule.findUnique({ where: { id } });
  if (!existing) throw notFound('Approval rule');
  // Every change bumps the version; submitted items keep the version they were routed with.
  const rule = await prisma.approvalRule.update({ where: { id }, data: { ...data, version: existing.version + 1 } });
  await audit(actor, 'rule.updated', 'RULE', id, { name: rule.name, fromVersion: existing.version, toVersion: rule.version, levels: rule.levels });
  return rule;
}

export async function deleteRule(actor, id) {
  const rule = await prisma.approvalRule.update({ where: { id }, data: { active: false, version: { increment: 1 } } });
  await audit(actor, 'rule.deactivated', 'RULE', id, { name: rule.name });
  return rule;
}

/** "Test this rule" simulator: who would approve for a given employee and amount. */
export async function simulate({ userId, entityType, amount, travelType, costCenterCode, hasException }) {
  if (!userId) throw badRequest('Choose an employee');
  return previewRoute(userId, { entityType, amount: Number(amount) || 0, travelType, costCenterCode, hasException: !!hasException });
}

// ---------- Categories / currencies / org ----------
export async function upsertCategory(actor, id, data) {
  const c = id ? await prisma.expenseCategory.update({ where: { id }, data }) : await prisma.expenseCategory.create({ data });
  await audit(actor, id ? 'category.updated' : 'category.created', 'CATEGORY', c.id, data);
  return c;
}

export const listAllCategories = () => prisma.expenseCategory.findMany({ orderBy: { name: 'asc' } });
export const listAllCurrencies = () => prisma.currency.findMany({ orderBy: { code: 'asc' } });

export async function upsertCurrency(actor, code, data) {
  const c = await prisma.currency.upsert({ where: { code }, create: { code, ...data }, update: data });
  await audit(actor, 'currency.rate_updated', 'CURRENCY', code, { rateToBase: data.rateToBase });
  return c;
}

export const listDepartments = () =>
  prisma.department.findMany({ include: { head: { select: { id: true, name: true } }, _count: { select: { members: true } } }, orderBy: { name: 'asc' } });

export async function upsertDepartment(actor, id, data) {
  const d = id ? await prisma.department.update({ where: { id }, data }) : await prisma.department.create({ data });
  await audit(actor, id ? 'department.updated' : 'department.created', 'DEPARTMENT', d.id, data);
  return d;
}

export const listCostCenters = () => prisma.costCenter.findMany({ orderBy: { code: 'asc' } });

export async function upsertCostCenter(actor, id, data) {
  const c = id ? await prisma.costCenter.update({ where: { id }, data }) : await prisma.costCenter.create({ data });
  await audit(actor, id ? 'costcenter.updated' : 'costcenter.created', 'COSTCENTER', c.id, data);
  return c;
}

// ---------- Settings ----------
export const allSettings = () => getSettings();

export async function updateSettings(actor, patch) {
  const before = await getSettings();
  await prisma.$transaction(Object.entries(patch).map(([key, value]) => prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } })));
  const changed = Object.keys(patch).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(patch[k]));
  await audit(actor, 'settings.updated', 'SETTINGS', null, { changed: Object.fromEntries(changed.map((k) => [k, { from: before[k], to: patch[k] }])) });
  return getSettings();
}
