import { z } from 'zod';

export const loginBodySchema = z.object({
  username: z.string().min(1).max(255),
  password: z.string().min(1).max(255),
});

export type LoginBody = z.infer<typeof loginBodySchema>;
