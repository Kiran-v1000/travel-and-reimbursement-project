import { PrismaClient } from '@prisma/client';

// Single shared data-access client for the whole API.
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
