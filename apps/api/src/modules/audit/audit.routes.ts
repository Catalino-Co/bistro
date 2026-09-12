import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listAuditActionKeys, listAuditEntries } from './audit.repo.js';

const VIEW_AUDIT = ['audit.view'] as const;

const listQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  actionKey: z.string().min(1).max(100).optional(),
  userId: z.coerce.number().int().positive().optional(),
  search: z.string().min(1).max(100).optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * Lectura de la bitácora. Solo lectura, a propósito: un registro de
 * auditoría que se puede editar o borrar desde la aplicación no sirve de
 * nada como registro de auditoría.
 */
export async function auditRoutes(app: FastifyInstance) {
  app.get('/audit', { config: { permissions: [...VIEW_AUDIT] } }, async (request, reply) => {
    const branchId = request.session.branchId;
    if (typeof branchId !== 'number') {
      reply.code(409);
      return { error: 'no_branch_selected' };
    }
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const { from, to, actionKey, userId, search, cursor, limit } = parsed.data;
    return listAuditEntries(branchId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      actionKey,
      userId,
      search,
      cursor,
      limit,
    });
  });

  app.get(
    '/audit/actions',
    { config: { permissions: [...VIEW_AUDIT] } },
    async (request, reply) => {
      const branchId = request.session.branchId;
      if (typeof branchId !== 'number') {
        reply.code(409);
        return { error: 'no_branch_selected' };
      }
      return { actionKeys: await listAuditActionKeys(branchId) };
    },
  );
}
