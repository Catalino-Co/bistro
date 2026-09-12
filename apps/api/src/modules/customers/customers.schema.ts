import { z } from 'zod';

export const createCustomerBodySchema = z.object({
  customerTypeId: z.number().int().positive(),
  name: z.string().min(1).max(200),
});
