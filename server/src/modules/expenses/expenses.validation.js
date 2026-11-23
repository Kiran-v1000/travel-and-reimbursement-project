import { z } from 'zod';

export const reportSchema = z.object({
  title: z.string().trim().min(3, 'Give the report a short title').max(140),
  purpose: z.string().trim().min(5, 'Describe the business purpose').max(2000),
  travelRequestId: z.string().optional().nullable(),
  costCenterId: z.string().min(1, 'Choose a cost center'),
  projectCode: z.string().trim().max(40).optional().nullable(),
});

export const lineSchema = z.object({
  date: z.coerce.date(),
  categoryId: z.string().min(1, 'Choose a category'),
  merchant: z.string().trim().min(1, 'Who did you pay?').max(140),
  description: z.string().trim().max(500).optional().nullable(),
  amount: z.coerce.number().positive('Amount must be greater than zero').max(100000000),
  tax: z.coerce.number().min(0).max(100000000).default(0),
  currency: z.string().length(3).default('INR'),
  paymentMethod: z.enum(['PERSONAL_CARD', 'CASH', 'UPI', 'CORPORATE_CARD', 'BANK_TRANSFER']).default('PERSONAL_CARD'),
});

export const submitSchema = z.object({ exceptionReason: z.string().trim().max(2000).optional() });
