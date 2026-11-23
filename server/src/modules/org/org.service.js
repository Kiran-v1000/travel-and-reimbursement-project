/**
 * Org chart. Built for 100k people: the chart is loaded one person at a time -
 * their management chain (from User.ancestors, one query), the person, and their direct
 * reports with team sizes ("everyone under X" is a GIN index lookup on ancestors).
 * Team sizes are cached briefly per person, so popular nodes (CEO, VPs) stay cheap.
 */
import { prisma } from '../../db/pool.js';
import { notFound } from '../../shared/errors/AppError.js';
import { memo } from '../../shared/utils/cache.js';

const MAX_REPORTS = 300;

const cardSelect = {
  id: true, name: true, title: true, employeeId: true, email: true, location: true, role: true, active: true, managerId: true,
  department: { select: { id: true, code: true, name: true, headId: true } },
};

const toCard = (u, sizes) => ({
  ...u,
  isDeptHead: !!u.department && u.department.headId === u.id,
  directs: sizes?.directs ?? 0,
  teamSize: sizes?.team ?? 0,
});

/** Direct-report and whole-team counts for many people in one round trip. */
async function sizesFor(ids) {
  if (!ids.length) return new Map();
  const rows = await prisma.$queryRaw`
    SELECT p.id,
      (SELECT count(*) FROM "User" d WHERE d."managerId" = p.id AND d.active)::int AS directs,
      (SELECT count(*) FROM "User" u WHERE u.ancestors @> ARRAY[p.id] AND u.active)::int AS team
    FROM unnest(${ids}::text[]) AS p(id)`;
  return new Map(rows.map((r) => [r.id, { directs: r.directs, team: r.team }]));
}

const cachedSizes = (ids) => memo('org-sizes', [...ids].sort().join(','), 60_000, () => sizesFor(ids), 2000, 5 * 60_000);

/** The chart around one person (default: whoever is asking). */
export async function chart(viewer, focusId) {
  const person = await prisma.user.findUnique({ where: { id: focusId || viewer.id }, select: { ...cardSelect, ancestors: true } });
  if (!person) throw notFound('Person');

  const [chainRows, reports, reportTotal, me] = await Promise.all([
    person.ancestors.length ? prisma.user.findMany({ where: { id: { in: person.ancestors } }, select: cardSelect }) : [],
    prisma.user.findMany({ where: { managerId: person.id, active: true }, select: cardSelect, orderBy: { name: 'asc' }, take: MAX_REPORTS }),
    prisma.user.count({ where: { managerId: person.id, active: true } }),
    prisma.user.findUnique({ where: { id: viewer.id }, select: { ancestors: true } }),
  ]);
  // ancestors is top-first; keep that order (a missing row means the path is stale - skip it).
  const byId = new Map(chainRows.map((u) => [u.id, u]));
  const chain = person.ancestors.map((id) => byId.get(id)).filter(Boolean);

  const sizes = await cachedSizes([person.id, ...chain.map((c) => c.id), ...reports.map((r) => r.id)]);
  const reportCards = reports.map((r) => toCard(r, sizes.get(r.id)))
    // Managers first (biggest teams), then individual contributors by name.
    .sort((a, b) => b.teamSize - a.teamSize || a.name.localeCompare(b.name));

  const { ancestors, ...rest } = person;
  return {
    person: toCard(rest, sizes.get(person.id)),
    chain: chain.map((c) => toCard(c, sizes.get(c.id))),
    reports: reportCards,
    reportTotal,
    isViewer: person.id === viewer.id,
    // Where this person sits relative to the viewer (for "your manager", "your team" hints).
    relation: person.id === viewer.id ? 'SELF' : ancestors.includes(viewer.id) ? 'IN_MY_TEAM' : (me?.ancestors ?? []).includes(person.id) ? 'MY_MANAGER_LINE' : null,
  };
}

/** People with no manager (top of the organisation), biggest teams first. */
export async function roots() {
  const tops = await prisma.user.findMany({ where: { managerId: null, active: true }, select: cardSelect, take: 200 });
  const sizes = await cachedSizes(tops.map((t) => t.id));
  return tops.map((t) => toCard(t, sizes.get(t.id))).sort((a, b) => b.teamSize - a.teamSize || a.name.localeCompare(b.name));
}
