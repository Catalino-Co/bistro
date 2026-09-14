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

// Filtros del historial. `from`/`to` llegan como instantes ISO calculados
// por el cliente, que es quien sabe en qué zona horaria está "hoy" para
// quien mira la pantalla.
export const listOrdersQuerySchema = z.object({
  status: z.enum(['open', 'closed']).optional(),
  customerId: z.coerce.number().int().positive().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
