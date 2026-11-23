import { z } from 'zod';

const approverSpec = z.object({
  type: z.enum(['MANAGER', 'SKIP_MANAGER', 'DEPT_HEAD', 'TOP_OF_LINE', 'ROLE', 'USER']),
  role: z.enum(['EMPLOYEE', 'MANAGER', 'FINANCE', 'ADMIN', 'AUDITOR']).optional(),
  userId: z.string().optional(),
});

export const ruleSchema = z.object({
  name: z.string().trim().min(3).max(120),
  entityType: z.enum(['TRAVEL', 'EXPENSE']),
  priority: z.coerce.number().int().min(1).max(10000).default(100),
  minAmount: z.coerce.number().min(0).default(0),
  maxAmount: z.coerce.number().min(0).nullable().optional(),
  departmentId: z.string().nullable().optional(),
  costCenterCode: z.string().trim().max(30).nullable().optional(),
  travelType: z.enum(['DOMESTIC', 'INTERNATIONAL']).nullable().optional(),
  onPolicyException: z.boolean().default(false),
  levels: z
    .array(z.object({ label: z.string().trim().min(1).max(80), approvers: z.array(approverSpec).min(1).max(5) }))
    .min(1, 'Add at least one approval level')
    .max(8),
  active: z.boolean().default(true),
});

export const simulateSchema = z.object({
  userId: z.string().min(1, 'Choose an employee'),
  entityType: z.enum(['TRAVEL', 'EXPENSE']),
  amount: z.coerce.number().min(0),
  travelType: z.enum(['DOMESTIC', 'INTERNATIONAL']).optional(),
  costCenterCode: z.string().optional(),
  hasException: z.boolean().optional(),
});

export const categorySchema = z.object({
  code: z.string().trim().min(2).max(30),
  name: z.string().trim().min(2).max(80),
  icon: z.string().trim().max(40).default('receipt'),
  perItemLimit: z.coerce.number().min(0).nullable().optional(),
  receiptThreshold: z.coerce.number().min(0).default(500),
  active: z.boolean().default(true),
});

export const currencySchema = z.object({
  name: z.string().trim().min(2).max(60),
  symbol: z.string().trim().min(1).max(5),
  rateToBase: z.coerce.number().positive(),
  active: z.boolean().default(true),
});

export const deptSchema = z.object({
  code: z.string().trim().min(2).max(20),
  name: z.string().trim().min(2).max(80),
  headId: z.string().nullable().optional(),
});

export const costCenterSchema = z.object({
  code: z.string().trim().min(2).max(20),
  name: z.string().trim().min(2).max(80),
  active: z.boolean().default(true),
});

// Only known setting keys can be written.
export const settingsSchema = z
  .object({
    baseCurrency: z.string().length(3),
    leadDaysDomestic: z.coerce.number().int().min(0).max(365),
    leadDaysInternational: z.coerce.number().int().min(0).max(365),
    maxTripDays: z.coerce.number().int().min(1).max(365),
    lodgingCapDomestic: z.coerce.number().min(0),
    lodgingCapInternational: z.coerce.number().min(0),
    mealsPerDiem: z.coerce.number().min(0),
    submissionDeadlineDays: z.coerce.number().int().min(1).max(730),
    estimateTolerancePct: z.coerce.number().min(0).max(100),
    approvalTimeoutHours: z.coerce.number().int().min(1).max(720),
    escalationEnabled: z.boolean(),
    resubmitRule: z.enum(['RESTART', 'RETURNING_LEVEL']),
    fallbackApproverId: z.string().nullable(),
    emailNotifications: z.boolean(),
    retentionYears: z.coerce.number().int().min(1).max(30),
  })
  .partial()
  .strict();
