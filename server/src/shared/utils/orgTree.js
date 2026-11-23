/**
 * Reporting hierarchy helpers backed by User.ancestors (materialised path, GIN-indexed).
 * "Everyone under X" = ancestors @> {X}: one index scan, no giant IN (...) lists.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../db/pool.js';

/**
 * Change a user's manager and re-path the whole subtree under them in one statement.
 * Callers must check for loops first.
 */
export async function setManager(userId, managerId, tx = prisma) {
  let prefix = [];
  if (managerId) {
    const m = await tx.user.findUnique({ where: { id: managerId }, select: { id: true, ancestors: true } });
    prefix = [...(m?.ancestors ?? []), managerId];
  }
  await tx.user.update({ where: { id: userId }, data: { managerId, ancestors: prefix } });
  // Descendants keep their path below this user, with the new prefix above it.
  await tx.$executeRaw`
    UPDATE "User"
    SET "ancestors" = ${prefix}::text[] || "ancestors"[array_position("ancestors", ${userId}::text):]
    WHERE "ancestors" @> ARRAY[${userId}::text]`;
}

/** True if `managerId` is the user or sits below the user (would create a loop). */
export async function isInSubtree(userId, managerId) {
  if (!managerId) return false;
  if (managerId === userId) return true;
  const m = await prisma.user.findUnique({ where: { id: managerId }, select: { ancestors: true, managerId: true } });
  if (m?.ancestors?.length) return m.ancestors.includes(userId);
  // Path not materialised (e.g. a row written outside setManager): walk the chain instead.
  let cursor = m?.managerId;
  for (let i = 0; cursor && i < 50; i++) {
    if (cursor === userId) return true;
    cursor = (await prisma.user.findUnique({ where: { id: cursor }, select: { managerId: true } }))?.managerId;
  }
  return false;
}

/** Prisma filter for "this user or anyone in their reporting line". */
export const inTeamOf = (userId) => ({ OR: [{ id: userId }, { ancestors: { has: userId } }] });

/** SQL predicate for a column holding a user id: that user is `me` or reports (indirectly) to `me`. */
export const sqlInTeamOf = (column, me) =>
  Prisma.sql`EXISTS (SELECT 1 FROM "User" tu WHERE tu.id = ${column} AND (tu.id = ${me} OR tu."ancestors" @> ARRAY[${me}::text]))`;

/** Recompute every path from managerId (used after bulk imports / seeding). */
export async function rebuildOrgTree() {
  await prisma.$executeRaw`
    WITH RECURSIVE tree AS (
      SELECT id, ARRAY[]::TEXT[] AS anc FROM "User" WHERE "managerId" IS NULL
      UNION ALL
      SELECT u.id, tree.anc || u."managerId" FROM "User" u JOIN tree ON u."managerId" = tree.id
    )
    UPDATE "User" SET "ancestors" = tree.anc FROM tree WHERE "User".id = tree.id`;
}
