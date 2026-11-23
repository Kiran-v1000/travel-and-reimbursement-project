import { z } from 'zod';

const money = z.coerce.number().min(0, 'Must be zero or more').max(100000000);

export const travelSchema = z
  .object({
    title: z.string().trim().min(3, 'Give the trip a short title').max(140),
    purpose: z.string().trim().min(5, 'Describe the business purpose').max(2000),
    travelType: z.enum(['DOMESTIC', 'INTERNATIONAL']),
    origin: z.string().trim().min(2, 'Where are you travelling from?').max(120),
    destination: z.string().trim().min(2, 'Where are you going?').max(240),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    travelers: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
    estTransport: money.default(0),
    estLodging: money.default(0),
    estMeals: money.default(0),
    estOther: money.default(0),
    currency: z.string().length(3).default('INR'),
    costCenterId: z.string().min(1, 'Choose a cost center'),
    projectCode: z.string().trim().max(40).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .refine((d) => d.endDate >= d.startDate, { message: 'Return date must be on or after departure', path: ['endDate'] });

export const draftSchema = z.object({}).passthrough();

export const submitSchema = z.object({ exceptionReason: z.string().trim().max(2000).optional() });
