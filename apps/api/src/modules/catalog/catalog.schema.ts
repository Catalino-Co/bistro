import { z } from 'zod';

export const nameBodySchema = z.object({
  name: z.string().min(1).max(200),
});

export const familyBodySchema = z.object({
  categoryId: z.number().int().positive(),
  name: z.string().min(1).max(200),
});

export const subfamilyBodySchema = z.object({
  familyId: z.number().int().positive(),
  name: z.string().min(1).max(200),
});

export const itemBodySchema = z.object({
  subfamilyId: z.number().int().positive(),
  name: z.string().min(1).max(200),
  price: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Expected a decimal string'),
  taxRateId: z.number().int().positive(),
  stationId: z.number().int().positive().optional(),
});

export const itemStationBodySchema = z.object({
  stationId: z.number().int().positive().nullable(),
});
