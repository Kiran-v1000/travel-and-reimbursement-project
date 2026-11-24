/**
 * User-guide feedback ("Was this helpful?"). The articles themselves ship with the web app;
 * the server only stores the answers so administrators can see which articles need work.
 */
import { prisma } from '../../db/pool.js';

/** One answer per person per article; answering again replaces the earlier answer. */
export async function recordFeedback(user, { slug, helpful }) {
  await prisma.helpFeedback.upsert({
    where: { userId_slug: { userId: user.id, slug } },
    create: { userId: user.id, slug, helpful },
    update: { helpful },
  });
  return { ok: true };
}

/** Per-article counts for the last 90 days (administrators). No names are returned. */
export async function feedbackSummary() {
  const since = new Date(Date.now() - 90 * 86400_000);
  const rows = await prisma.helpFeedback.groupBy({
    by: ['slug', 'helpful'],
    where: { updatedAt: { gte: since } },
    _count: { _all: true },
  });
  const bySlug = new Map();
  for (const r of rows) {
    const e = bySlug.get(r.slug) ?? { slug: r.slug, helpful: 0, notHelpful: 0 };
    if (r.helpful) e.helpful += r._count._all;
    else e.notHelpful += r._count._all;
    bySlug.set(r.slug, e);
  }
  return [...bySlug.values()];
}
