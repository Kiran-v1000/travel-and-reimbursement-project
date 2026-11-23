import { z } from 'zod';
import { passwordProblem } from '../../db/seeds/reference-data.js';

const roles = z.enum(['EMPLOYEE', 'MANAGER', 'FINANCE', 'ADMIN', 'AUDITOR']);

const userBase = {
  employeeId: z.string().trim().min(1).max(30),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  role: roles,
  title: z.string().trim().max(120).optional().nullable(),
  location: z.string().trim().max(120).optional().nullable(),
  departmentId: z.string().optional().nullable(),
  costCenterId: z.string().optional().nullable(),
  managerId: z.string().optional().nullable(),
  active: z.boolean().optional(),
  password: z
    .string()
    .max(200)
    .superRefine((pw, ctx) => {
      const problem = passwordProblem(pw);
      if (problem) ctx.addIssue({ code: 'custom', message: `Password needs ${problem}` });
    })
    .optional(),
};

export const createSchema = z.object(userBase);
export const updateSchema = z.object(userBase).partial();

// Multipart form fields arrive as strings.
const flag = z.preprocess((v) => v === true || v === 'true' || v === 'on' || v === '1', z.boolean());
export const importOptionsSchema = z.object({
  mode: z.enum(['VALIDATE', 'APPLY']).default('VALIDATE'),
  createMissing: flag.default(false),
  deactivateMissing: flag.default(false),
});

export const delegationSchema = z
  .object({
    delegateId: z.string().min(1, 'Choose a delegate'),
    delegatorId: z.string().optional(),
    scope: z.enum(['ALL', 'TRAVEL', 'EXPENSE']).default('ALL'),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    reason: z.string().trim().max(300).optional(),
  })
  .refine((d) => d.endDate >= d.startDate, { message: 'End date must be after start date', path: ['endDate'] });
