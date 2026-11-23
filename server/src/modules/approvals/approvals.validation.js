import { z } from 'zod';

export const actSchema = z.object({
  action: z.enum(['APPROVED', 'REJECTED', 'RETURNED']),
  comment: z.string().trim().max(1000).optional(),
});

export const bulkSchema = z.object({
  stepIds: z.array(z.string()).min(1).max(50),
  comment: z.string().trim().max(1000).optional(),
});
