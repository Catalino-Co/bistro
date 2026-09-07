import { z } from 'zod';

export const nameBodySchema = z.object({
  name: z.string().min(1).max(200),
});

export const dineTableBodySchema = z.object({
  dineAreaId: z.number().int().positive(),
  name: z.string().min(1).max(200),
  seats: z.number().int().positive().max(50).default(2),
});

export const dineTableUpdateBodySchema = z.object({
  name: z.string().min(1).max(200),
  seats: z.number().int().positive().max(50),
});
