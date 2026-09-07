import { z } from 'zod';

export const selectBranchBodySchema = z.object({
  branchId: z.number().int().positive(),
});
