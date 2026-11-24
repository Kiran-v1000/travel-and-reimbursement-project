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

/** { field: { from, to } } for the fields that actually changed (JSON-compared). */
function diff(before, after, keys) {
  const out = {};
  for (const k of keys) {
    const x = before?.[k] ?? null;
    const y = after?.[k] ?? null;
    if (JSON.stringify(x) !== JSON.stringify(y)) out[k] = { from: x, to: y };
  }
  return out;
}

const RULE_FIELDS = ['name', 'entityType', 'priority', 'minAmount', 'maxAmount', 'departmentId', 'costCenterCode', 'travelType', 'onPolicyException', 'levels', 'active'];

// ---------- Approval rules (versioned) ----------
// Every change and its audit entry commit together (no unaudited routing change).
export const listRules = () =>
  prisma.approvalRule.findMany({ include: { department: { select: { name: true } } }, orderBy: [{ entityType: 'asc' }, { priority: 'asc' }] });

export async function createRule(actor, data) {
  return prisma.$transaction(async (tx) => {
    const rule = await tx.approvalRule.create({ data });
    await audit(actor, 'rule.created', 'RULE', rule.id, { name: rule.name, version: 1, after: JSON.parse(JSON.stringify(rule)) }, { tx });
    return rule;
  });
}

export async function updateRule(actor, id, data) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.approvalRule.findUnique({ where: { id } });
    if (!existing) throw notFound('Approval rule');
    // Every change bumps the version; submitted items keep the version they were routed with.
    const rule = await tx.approvalRule.update({ where: { id }, data: { ...data, version: existing.version + 1 } });
    await audit(actor, 'rule.updated', 'RULE', id, {
      name: rule.name, version: { from: existing.version, to: rule.version },
      changed: diff(JSON.parse(JSON.stringify(existing)), JSON.parse(JSON.stringify(rule)), RULE_FIELDS),
    }, { tx });
    return rule;
  });
}

export async function deleteRule(actor, id) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.approvalRule.findUnique({ where: { id } });
    if (!existing) throw notFound('Approval rule');
    const rule = await tx.approvalRule.update({ where: { id }, data: { active: false, version: { increment: 1 } } });
    await audit(actor, 'rule.deactivated', 'RULE', id, { name: rule.name, active: { from: existing.active, to: false }, version: { from: existing.version, to: rule.version } }, { tx });
    return rule;
  });
}

/** "Test this rule" simulator: who would approve for a given employee and amount. */
export async function simulate({ userId, entityType, amount, travelType, costCenterCode, hasException }) {
  if (!userId) throw badRequest('Choose an employee');
  return previewRoute(userId, { entityType, amount: Number(amount) || 0, travelType, costCenterCode, hasException: !!hasException });
}

// ---------- Categories / currencies / org (policy reference data) ----------
/** Create or update one row and audit exactly what changed, in one transaction. */
async function upsertAudited(actor, model, id, data, { kind, entityType, entityId }) {
  return prisma.$transaction(async (tx) => {
    const before = id ? await tx[model].findUnique({ where: { id } }) : null;
    if (id && !before) throw notFound(kind);
    const row = id ? await tx[model].update({ where: { id }, data }) : await tx[model].create({ data });
    const plain = (o) => (o ? JSON.parse(JSON.stringify(o)) : null);
    await audit(actor, `${kind}.${id ? 'updated' : 'created'}`, entityType, entityId?.(row) ?? row.id,
      id ? { changed: diff(plain(before), plain(row), Object.keys(data)) } : { after: plain(row) }, { tx });
    return row;
  });
}

export const upsertCategory = (actor, id, data) => upsertAudited(actor, 'expenseCategory', id, data, { kind: 'category', entityType: 'CATEGORY' });

export const listAllCategories = () => prisma.expenseCategory.findMany({ orderBy: { name: 'asc' } });
export const listAllCurrencies = () => prisma.currency.findMany({ orderBy: { code: 'asc' } });

export async function upsertCurrency(actor, code, data) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.currency.findUnique({ where: { code } });
    const c = await tx.currency.upsert({ where: { code }, create: { code, ...data }, update: data });
    const plain = (o) => (o ? JSON.parse(JSON.stringify(o)) : null);
    await audit(actor, before ? 'currency.updated' : 'currency.created', 'CURRENCY', code, { changed: diff(plain(before), plain(c), Object.keys(data)) }, { tx });
    return c;
  });
}

export const listDepartments = () =>
  prisma.department.findMany({ include: { head: { select: { id: true, name: true } }, _count: { select: { members: true } } }, orderBy: { name: 'asc' } });

export const upsertDepartment = (actor, id, data) => upsertAudited(actor, 'department', id, data, { kind: 'department', entityType: 'DEPARTMENT' });

export const listCostCenters = () => prisma.costCenter.findMany({ orderBy: { code: 'asc' } });

export const upsertCostCenter = (actor, id, data) => upsertAudited(actor, 'costCenter', id, data, { kind: 'costcenter', entityType: 'COSTCENTER' });

// ---------- Settings ----------
export const allSettings = () => getSettings();

export async function updateSettings(actor, patch) {
  const before = await getSettings();
  const changed = Object.keys(patch).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(patch[k]));
  await prisma.$transaction(async (tx) => {
    for (const [key, value] of Object.entries(patch)) await tx.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
    await audit(actor, 'settings.updated', 'SETTINGS', null, { changed: Object.fromEntries(changed.map((k) => [k, { from: before[k] ?? null, to: patch[k] }])) }, { tx });
  });
  return getSettings();
}
