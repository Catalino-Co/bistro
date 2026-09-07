import type { FastifyInstance } from 'fastify';
import { recordAuditEvent } from '../audit/audit.repo.js';
import { findBranchById, listBranchesForUser, userHasRoleInBranch } from './branches.repo.js';
import { selectBranchBodySchema } from './branches.schema.js';

// Replaces the legacy's session being mono-sucursal with everything
// hardcoded to bra_id=1 (see the audit's section 8.2): a user's available
// branches come from their actual user_roles assignments, and which one is
// "active" lives on the session, switchable without logging out.
export async function branchesRoutes(app: FastifyInstance) {
  app.get('/branches/mine', { config: { permissions: [] } }, async (request) => {
    const userId = request.session.userId;
    if (typeof userId !== 'number') {
      return { branches: [] };
    }
    const branches = await listBranchesForUser(userId);
    return { branches };
  });

  app.post('/branches/select', { config: { permissions: [] } }, async (request, reply) => {
    const userId = request.session.userId;
    if (typeof userId !== 'number') {
      reply.code(401);
      return { error: 'unauthenticated' };
    }

    const parsed = selectBranchBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }

    const hasRole = await userHasRoleInBranch(userId, parsed.data.branchId);
    if (!hasRole) {
      reply.code(403);
      return { error: 'forbidden' };
    }

    const branch = await findBranchById(parsed.data.branchId);
    const previousBranchId = request.session.branchId;
    request.session.branchId = parsed.data.branchId;

    await recordAuditEvent({
      actionKey: 'branch.selected',
      entityType: 'branch',
      entityId: String(parsed.data.branchId),
      userId,
      branchId: parsed.data.branchId,
      beforeData: { branchId: previousBranchId ?? null },
      afterData: { branchId: parsed.data.branchId },
    });

    return { branch };
  });
}
