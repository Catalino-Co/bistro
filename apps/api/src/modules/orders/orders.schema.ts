import { z } from 'zod';

export const openOrderBodySchema = z.object({
  dineTableId: z.number().int().positive(),
});
