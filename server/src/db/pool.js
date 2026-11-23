import { PrismaClient } from '@prisma/client';

// Log any SQL slower than SLOW_QUERY_MS (e.g. 200) - cheap production diagnostics.
const slowMs = Number(process.env.SLOW_QUERY_MS || 0);

// Single shared data-access client for the whole API.
export const prisma = new PrismaClient({
  log: [
    ...(slowMs ? [{ emit: 'event', level: 'query' }] : []),
    { emit: 'stdout', level: 'error' },
    ...(process.env.NODE_ENV === 'development' ? [{ emit: 'stdout', level: 'warn' }] : []),
  ],
});

if (slowMs) {
  prisma.$on('query', (e) => {
    if (e.duration >= slowMs) console.warn(`[slow-query] ${e.duration}ms ${e.query.replace(/\s+/g, ' ').slice(0, 400)}`);
  });
}
