import { z } from 'zod';

const method = z.enum(['BANK_TRANSFER', 'PAYROLL', 'CHEQUE', 'UPI']);

export const decideSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'RETURN']),
  comment: z.string().trim().max(1000).optional(),
  method: method.optional(),
  scheduledFor: z.coerce.date().optional(),
});

export const recodeSchema = z.object({
  costCenterId: z.string().optional(),
  projectCode: z.string().trim().max(40).optional().nullable(),
  lines: z.array(z.object({ id: z.string(), categoryId: z.string() })).optional(),
});

export const paymentSchema = z.object({
  method,
  amount: z.coerce.number().positive(),
  currency: z.string().length(3).optional(),
  paidAt: z.coerce.date(),
  reference: z.string().trim().min(3, 'Enter the bank / transaction reference').max(80),
});

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date');

export const exportSchema = z.object({
  from: isoDay,
  to: isoDay,
  format: z.enum(['CSV', 'TALLY']).default('CSV'),
});
