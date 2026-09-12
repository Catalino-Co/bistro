import type { FastifyInstance } from 'fastify';
import { listUsers } from './users.repo.js';
import {
  createUserBodySchema,
  resetPasswordBodySchema,
  updateUserBodySchema,
  userRoleBodySchema,
} from './users.schema.js';
import {
  assignRole,
  createUser,
  resetUserPassword,
  revokeRole,
  updateUser,
} from './users.service.js';

const MANAGE_USERS = ['system.users.manage'] as const;

// `system.users.manage` llevaba declarado desde el principio sin que
// ninguna ruta lo mirara: el permiso existía, la funcionalidad no. Estas
// son las rutas que por fin lo usan.
//
// Toda ruta exige un permiso no vacío, así que el guard ya verificó que
// request.session.userId es un number antes de que corra cualquier
// handler -- el `!` de abajo afirma esa garantía, no la esquiva.
export async function usersRoutes(app: FastifyInstance) {
  app.get('/users', { config: { permissions: [...MANAGE_USERS] } }, async () => ({
    users: await listUsers(),
  }));

  app.post('/users', { config: { permissions: [...MANAGE_USERS] } }, async (request, reply) => {
    const parsed = createUserBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }

    const result = await createUser(
      parsed.data.username,
      parsed.data.fullName,
      parsed.data.password,
      request.session.userId!,
    );

    switch (result.outcome) {
      case 'username_taken':
        reply.code(409);
        return { error: 'username_taken' };
      case 'created':
        reply.code(201);
        return { user: result.user };
    }
  });

  app.patch(
    '/users/:id',
    { config: { permissions: [...MANAGE_USERS] } },
    async (request, reply) => {
      const parsed = updateUserBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }

      const result = await updateUser(
        Number((request.params as { id: string }).id),
        parsed.data,
        request.session.userId!,
      );

      if (result.outcome === 'user_not_found') {
        reply.code(404);
        return { error: 'user_not_found' };
      }
      reply.code(204);
      return null;
    },
  );

  app.post(
    '/users/:id/password',
    { config: { permissions: [...MANAGE_USERS] } },
    async (request, reply) => {
      const parsed = resetPasswordBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }

      const result = await resetUserPassword(
        Number((request.params as { id: string }).id),
        parsed.data.password,
        request.session.userId!,
      );

      if (result.outcome === 'user_not_found') {
        reply.code(404);
        return { error: 'user_not_found' };
      }
      reply.code(204);
      return null;
    },
  );

  app.post(
    '/users/:id/roles',
    { config: { permissions: [...MANAGE_USERS] } },
    async (request, reply) => {
      const parsed = userRoleBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }

      const result = await assignRole(
        Number((request.params as { id: string }).id),
        parsed.data.roleId,
        parsed.data.branchId,
        request.session.userId!,
      );

      switch (result.outcome) {
        case 'user_not_found':
          reply.code(404);
          return { error: 'user_not_found' };
        case 'role_not_found':
          reply.code(404);
          return { error: 'role_not_found' };
        case 'branch_not_found':
          reply.code(404);
          return { error: 'branch_not_found' };
        case 'already_assigned':
        case 'assigned':
          reply.code(204);
          return null;
      }
    },
  );

  app.delete(
    '/users/:id/roles/:roleId/branches/:branchId',
    { config: { permissions: [...MANAGE_USERS] } },
    async (request, reply) => {
      const params = request.params as { id: string; roleId: string; branchId: string };
      await revokeRole(
        Number(params.id),
        Number(params.roleId),
        Number(params.branchId),
        request.session.userId!,
      );
      reply.code(204);
      return null;
    },
  );
}
