import { PrismaClient } from '@prisma/client';

// Log any SQL slower than SLOW_QUERY_MS (e.g. 200) - cheap production diagnostics.
const slowMs = Number(process.env.SLOW_QUERY_MS || 0);

const base = new PrismaClient({
  log: [
    ...(slowMs ? [{ emit: 'event', level: 'query' }] : []),
    { emit: 'stdout', level: 'error' },
    ...(process.env.NODE_ENV === 'development' ? [{ emit: 'stdout', level: 'warn' }] : []),
  ],
});

if (slowMs) {
  base.$on('query', (e) => {
    if (e.duration >= slowMs) console.warn(`[slow-query] ${e.duration}ms ${e.query.replace(/\s+/g, ' ').slice(0, 400)}`);
  });
}

// Connection-level failures that are safe to retry for a read: could not reach / connect to the
// server, or the connection pool was briefly exhausted. (Happens during DB restarts, fail-overs,
// pooler restarts, or a momentary network blip.)
const TRANSIENT = new Set(['P1001', 'P1002', 'P1017', 'P2024']);
const READS = new Set(['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy']);
const BACKOFF_MS = [100, 400];

export const isTransientDbError = (err) => TRANSIENT.has(err?.code) || /Can't reach database server/.test(err?.message ?? '');

/**
 * Single shared data-access client. Reads retry twice on transient connection errors; writes are
 * never retried automatically (a write that may have reached the database must not run twice).
 */
export const prisma = base.$extends({
  query: {
    $allModels: {
      async $allOperations({ operation, args, query }) {
        if (!READS.has(operation)) return query(args);
        for (let attempt = 0; ; attempt++) {
          try {
            return await query(args);
          } catch (err) {
            if (attempt >= BACKOFF_MS.length || !isTransientDbError(err)) throw err;
            await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
          }
        }
      },
    },
  },
});
