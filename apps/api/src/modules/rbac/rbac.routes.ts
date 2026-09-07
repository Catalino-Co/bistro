import type { FastifyInstance } from 'fastify';
import { listPermissions, listRolePermissionIds, listRoles } from './rbac.repo.js';
import { createRoleBodySchema, rolePermissionBodySchema } from './rbac.schema.js';
import { createRole, grantPermissionToRole, revokePermissionFromRole } from './rbac.service.js';

const MANAGE_ROLES = ['system.roles.manage'] as const;

export async function rbacRoutes(app: FastifyInstance) {
  // Every route below requires a non-empty `permissions` array, so the
  // guard plugin has already verified request.session.userId is a number
  // before any handler runs -- the `!` below is asserting that guarantee,
  // not bypassing a real possibility of it being undefined.

  app.get('/rbac/roles', { config: { permissions: [...MANAGE_ROLES] } }, async () => {
    return { roles: await listRoles() };
  });

  app.post(
    '/rbac/roles',
    { config: { permissions: [...MANAGE_ROLES] } },
    async (request, reply) => {
      const parsed = createRoleBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      const role = await createRole(parsed.data.name, request.session.userId!);
      reply.code(201);
      return { role };
    },
  );

  app.get('/rbac/permissions', { config: { permissions: [...MANAGE_ROLES] } }, async () => {
    return { permissions: await listPermissions() };
  });

  app.get(
    '/rbac/roles/:roleId/permissions',
    { config: { permissions: [...MANAGE_ROLES] } },
    async (request) => {
      const roleId = Number((request.params as { roleId: string }).roleId);
      return { permissionIds: await listRolePermissionIds(roleId) };
    },
  );

  app.post(
    '/rbac/roles/:roleId/permissions',
    { config: { permissions: [...MANAGE_ROLES] } },
    async (request, reply) => {
      const roleId = Number((request.params as { roleId: string }).roleId);
      const parsed = rolePermissionBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      await grantPermissionToRole(roleId, parsed.data.permissionId, request.session.userId!);
      reply.code(204);
      return null;
    },
  );

  app.delete(
    '/rbac/roles/:roleId/permissions/:permissionId',
    { config: { permissions: [...MANAGE_ROLES] } },
    async (request, reply) => {
      const params = request.params as { roleId: string; permissionId: string };
      await revokePermissionFromRole(
        Number(params.roleId),
        Number(params.permissionId),
        request.session.userId!,
      );
      reply.code(204);
      return null;
    },
  );
}
