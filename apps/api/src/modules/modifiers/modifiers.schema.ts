import { z } from 'zod';

export const modifierGroupBodySchema = z.object({
  name: z.string().min(1).max(200),
  selectionType: z.enum(['single', 'multiple']).default('single'),
});

export const modifierBodySchema = z.object({
  groupId: z.number().int().positive(),
  name: z.string().min(1).max(200),
  priceDelta: z.string().regex(/^-?\d+(\.\d{1,4})?$/, 'Expected a decimal string'),
});

export const itemAssociationBodySchema = z.object({
  itemId: z.number().int().positive(),
  modifierGroupId: z.number().int().positive(),
});
