import { z } from 'zod';

export const createRoleBodySchema = z.object({
  name: z.string().min(1).max(100),
});

export const rolePermissionBodySchema = z.object({
  permissionId: z.number().int().positive(),
});
