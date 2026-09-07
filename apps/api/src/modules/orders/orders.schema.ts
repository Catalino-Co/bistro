import { z } from 'zod';

export const openOrderBodySchema = z.object({
  dineTableId: z.number().int().positive(),
});

export const addOrderLineBodySchema = z.object({
  itemId: z.number().int().positive(),
  quantity: z.number().int().positive().max(999).default(1),
  note: z.string().max(500).optional(),
  modifierIds: z.array(z.number().int().positive()).default([]),
});
