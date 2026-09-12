import { z } from 'zod';

export const openOrderBodySchema = z.object({
  dineTableId: z.number().int().positive(),
  dispatchMode: z.enum(['dine_in', 'delivery', 'pickup', 'room_service']).default('dine_in'),
  customerId: z.number().int().positive().optional(),
});

export const addOrderLineBodySchema = z.object({
  itemId: z.number().int().positive(),
  quantity: z.number().int().positive().max(999).default(1),
  note: z.string().max(500).optional(),
  modifierIds: z.array(z.number().int().positive()).default([]),
});

export const updateOrderLineBodySchema = z.object({
  quantity: z.number().int().positive().max(999),
  note: z.string().max(500).optional(),
  modifierIds: z.array(z.number().int().positive()).default([]),
});

export const voidOrderLineBodySchema = z.object({
  reason: z.string().max(500).optional(),
});
