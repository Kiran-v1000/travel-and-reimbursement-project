import { z } from 'zod';

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date');

export const holdSchema = z
  .object({
    scope: z.enum(['EMPLOYEE', 'EXPENSE', 'TRAVEL', 'PERIOD']),
    userId: z.string().optional(),
    code: z.string().trim().max(40).optional(),
    from: isoDay.optional(),
    to: isoDay.optional(),
    reason: z.string().trim().min(5, 'Give a reason (at least 5 characters)').max(300),
    reference: z.string().trim().max(80).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.scope === 'EMPLOYEE' && !v.userId) ctx.addIssue({ code: 'custom', path: ['userId'], message: 'Choose the employee' });
    if ((v.scope === 'EXPENSE' || v.scope === 'TRAVEL') && !v.code) ctx.addIssue({ code: 'custom', path: ['code'], message: 'Enter the record code' });
    if (v.scope === 'PERIOD' && !(v.from && v.to)) ctx.addIssue({ code: 'custom', path: ['from'], message: 'Choose the date range' });
  });

export const releaseSchema = z.object({
  reason: z.string().trim().min(5, 'Give a reason (at least 5 characters)').max(300),
});
