import { prisma } from '../../db/pool.js';
import { badRequest, forbidden, notFound, conflict, AppError } from '../../shared/errors/AppError.js';
import { nextCode, toBase, round2, getSetting, num, paging, toCsv, assertActiveRefs } from '../../shared/utils/index.js';
import { assertCanView, visibilityWhere } from '../../shared/utils/access.js';
import { memo, totalFromCounts } from '../../shared/utils/cache.js';
import { audit } from '../audit/audit.service.js';
import { notify } from '../notifications/notifications.service.js';
import { checkTravel, hasViolation } from '../policy/policy.service.js';
import { selectRule, createRoute } from '../approvals/approvals.engine.js';
import { previewRoute, returningLevel } from '../approvals/approvals.preview.js';
import { timeline } from '../approvals/approvals.service.js';
import { assertChangeable, holdsFor } from '../compliance/compliance.holds.service.js';

const listSelect = {
  id: true, code: true, title: true, origin: true, destination: true, travelType: true, startDate: true, endDate: true,
  estTotalBase: true, currency: true, status: true, submittedAt: true, updatedAt: true, policyFlags: true, round: true,
  requester: { select: { id: true, name: true, title: true } },
  costCenter: { select: { code: true, name: true } },
  steps: { where: { status: 'PENDING' }, select: { label: true, approver: { select: { name: true } } } },
};

async function computeTotals(d) {
  const sum = num(d.estTransport) + num(d.estLodging) + num(d.estMeals) + num(d.estOther);
  const fx = await toBase(sum, d.currency);
  const lodging = await toBase(num(d.estLodging), d.currency);
  const meals = await toBase(num(d.estMeals), d.currency);
  return { estTotalBase: fx.base, lodgingBase: lodging.base, mealsBase: meals.base };
}

export async function list(user, q) {
  const { skip, take, page, pageSize } = paging(q);
  const where = { AND: [] };
  if (q.scope === 'mine' || !q.scope) where.AND.push({ requesterId: user.id });
  else where.AND.push(await visibilityWhere(user, 'requesterId', 'TRAVEL'));
  if (q.status) where.AND.push({ status: { in: q.status.split(',') } });
  if (q.search) {
    where.AND.push({
      OR: [
        { code: { contains: q.search, mode: 'insensitive' } },
        { title: { contains: q.search, mode: 'insensitive' } },
        { destination: { contains: q.search, mode: 'insensitive' } },
        { requester: { name: { contains: q.search, mode: 'insensitive' } } },
      ],
    });
  }
  // Tab counts double as the total; cached for 30s on team scopes (see expenses.service).
  const countsFn = async () =>
    Object.fromEntries(
      (await prisma.travelRequest.groupBy({ by: ['status'], where: { AND: where.AND.filter((c) => !c.status) }, _count: true })).map((c) => [c.status, c._count]),
    );
  const mine = q.scope === 'mine' || !q.scope;
  const [items, counts] = await Promise.all([
    prisma.travelRequest.findMany({ where, select: listSelect, orderBy: { updatedAt: 'desc' }, skip, take }),
    mine ? countsFn() : memo('travel-counts', `${user.id}|${q.search ?? ''}`, 30_000, countsFn),
  ]);
  return { items, total: totalFromCounts(counts, q.status), page, pageSize, counts };
}

export async function get(user, id) {
  const t = await prisma.travelRequest.findUnique({
    where: { id },
    include: {
      requester: { select: { id: true, name: true, email: true, title: true, department: { select: { name: true } }, manager: { select: { name: true } } } },
      costCenter: { select: { id: true, code: true, name: true } },
      attachments: { select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true } },
      expenseReports: { select: { id: true, code: true, title: true, status: true, totalBase: true } },
    },
  });
  if (!t) throw notFound('Travel request');
  const steps = await timeline({ travelRequestId: id });
  await assertCanView(user, { ownerId: t.requesterId, entityType: 'TRAVEL', steps });
  const revisions = await prisma.revision.findMany({ where: { entityType: 'TRAVEL', entityId: id }, orderBy: { version: 'desc' } });
  const activity = await prisma.auditLog.findMany({ where: { entityType: 'TRAVEL', entityId: id }, orderBy: { seq: 'asc' } });
  const legalHolds = await holdsFor('TRAVEL', t);
  return { ...t, steps, revisions, activity, legalHolds };
}

export async function create(user, data) {
  await assertActiveRefs({ costCenterId: data.costCenterId });
  const totals = await computeTotals(data);
  const flags = await checkTravel({ ...data, ...totals });
  const t = await prisma.$transaction(async (tx) => {
    const code = await nextCode('TR', tx);
    return tx.travelRequest.create({
      data: { ...data, code, requesterId: user.id, estTotalBase: totals.estTotalBase, policyFlags: flags },
    });
  });
  await audit(user, 'travel.created', 'TRAVEL', t.id, { code: t.code });
  return t;
}

async function loadOwned(user, id) {
  const t = await prisma.travelRequest.findUnique({ where: { id } });
  if (!t) throw notFound('Travel request');
  if (t.requesterId !== user.id) throw forbidden('Only the requester can change this request');
  await assertChangeable('TRAVEL', t);
  return t;
}

export async function update(user, id, data) {
  const t = await loadOwned(user, id);
  if (!['DRAFT', 'RETURNED'].includes(t.status)) throw conflict('Only draft or returned requests can be edited');
  await assertActiveRefs({ costCenterId: data.costCenterId });
  const totals = await computeTotals(data);
  const flags = await checkTravel({ ...data, ...totals });
  const updated = await prisma.travelRequest.update({ where: { id }, data: { ...data, estTotalBase: totals.estTotalBase, policyFlags: flags } });
  await audit(user, 'travel.updated', 'TRAVEL', id, { code: t.code });
  return updated;
}

export async function policyPreview(user, data) {
  const totals = await computeTotals(data);
  const flags = await checkTravel({ ...data, ...totals });
  const costCenter = data.costCenterId ? await prisma.costCenter.findUnique({ where: { id: data.costCenterId } }) : null;
  const route = await previewRoute(user.id, {
    entityType: 'TRAVEL', amount: totals.estTotalBase, travelType: data.travelType, costCenterCode: costCenter?.code, hasException: hasViolation(flags),
  });
  return { flags, estTotalBase: totals.estTotalBase, route };
}

export async function submit(user, id, { exceptionReason }) {
  const t = await loadOwned(user, id);
  if (!['DRAFT', 'RETURNED'].includes(t.status)) throw conflict('This request has already been submitted');
  const totals = await computeTotals(t);
  const flags = await checkTravel({ ...t, ...totals });
  const exception = hasViolation(flags);
  if (exception && !exceptionReason?.trim() && !t.exceptionReason) {
    throw new AppError(422, 'This request is outside policy. Please explain why it is needed.', 'EXCEPTION_REASON_REQUIRED', { flags });
  }
  const requester = await prisma.user.findUnique({ where: { id: user.id } });
  const costCenter = t.costCenterId ? await prisma.costCenter.findUnique({ where: { id: t.costCenterId } }) : null;
  const rule = await selectRule({ entityType: 'TRAVEL', amount: totals.estTotalBase, requester, travelType: t.travelType, costCenterCode: costCenter?.code, hasException: exception });

  let skipLevelsBelow = null;
  if (t.status === 'RETURNED' && (await getSetting('resubmitRule', 'RESTART')) === 'RETURNING_LEVEL') {
    skipLevelsBelow = await returningLevel({ travelRequestId: id }, t.round);
  }

  const round = t.round + 1;
  const version = t.status === 'RETURNED' ? t.version + 1 : t.version;
  const result = await prisma.$transaction(async (tx) => {
    await tx.revision.create({ data: { entityType: 'TRAVEL', entityId: id, version, snapshot: JSON.parse(JSON.stringify({ ...t, policyFlags: flags })), createdById: user.id } });
    const route = await createRoute(tx, { entityType: 'TRAVEL', entityId: id, requester, rule, round, skipLevelsBelow });
    const final = route.firstActive == null;
    const updated = await tx.travelRequest.update({
      where: { id },
      data: {
        status: final ? 'APPROVED' : 'PENDING', round, version, submittedAt: new Date(), decidedAt: final ? new Date() : null,
        estTotalBase: totals.estTotalBase, policyFlags: flags, exceptionReason: exceptionReason?.trim() || t.exceptionReason,
        ruleId: rule.id, ruleName: rule.name, ruleVersion: rule.version,
      },
    });
    return { updated, route };
  });

  await audit(user, t.status === 'RETURNED' ? 'travel.resubmitted' : 'travel.submitted', 'TRAVEL', id, {
    code: t.code, amount: totals.estTotalBase, rule: rule.name, ruleVersion: rule.version, policyFlags: flags.map((f) => f.code), round,
  });
  const pending = result.route.steps.filter((s) => s.status === 'PENDING');
  await notify(pending.map((s) => s.approverId), {
    type: 'ACTION_REQUIRED', title: `Approval needed: ${t.code}`, body: `${requester.name} requested "${t.title}" (${t.origin} → ${t.destination}).`, link: `/travel/${id}`,
  });
  return result.updated;
}

export async function withdraw(user, id) {
  const t = await loadOwned(user, id);
  if (!['DRAFT', 'PENDING', 'RETURNED'].includes(t.status)) throw conflict('Decided requests cannot be withdrawn');
  await prisma.$transaction([
    prisma.approvalStep.updateMany({ where: { travelRequestId: id, status: { in: ['PENDING', 'WAITING'] } }, data: { status: 'CANCELLED', resolution: 'Withdrawn by requester' } }),
    prisma.travelRequest.update({ where: { id }, data: { status: 'WITHDRAWN' } }),
  ]);
  await audit(user, 'travel.withdrawn', 'TRAVEL', id, { code: t.code });
  return { ok: true };
}

export async function remove(user, id) {
  const t = await loadOwned(user, id);
  if (t.status !== 'DRAFT') throw badRequest('Only drafts can be deleted; withdraw submitted requests instead');
  await prisma.travelRequest.delete({ where: { id } });
  await audit(user, 'travel.draft_deleted', 'TRAVEL', id, { code: t.code });
  return { ok: true };
}

/** Approved trips the user can link to an expense report. */
export const linkable = (user) =>
  prisma.travelRequest.findMany({
    where: { requesterId: user.id, status: 'APPROVED' },
    select: { id: true, code: true, title: true, destination: true, startDate: true, endDate: true, estTotalBase: true, costCenterId: true, projectCode: true },
    orderBy: { startDate: 'desc' },
  });

export async function exportCsv(user, q) {
  const data = await list(user, { ...q, pageSize: 100, page: 1 });
  return toCsv(data.items, [
    { label: 'Code', value: 'code' },
    { label: 'Title', value: 'title' },
    { label: 'Requester', value: (r) => r.requester.name },
    { label: 'Type', value: 'travelType' },
    { label: 'From', value: 'origin' },
    { label: 'To', value: 'destination' },
    { label: 'Start', value: (r) => r.startDate.toISOString().slice(0, 10) },
    { label: 'End', value: (r) => r.endDate.toISOString().slice(0, 10) },
    { label: 'Estimate (base)', value: (r) => round2(num(r.estTotalBase)) },
    { label: 'Cost center', value: (r) => r.costCenter?.code },
    { label: 'Status', value: 'status' },
  ]);
}
