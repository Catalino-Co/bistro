import type { FastifyInstance } from 'fastify';
import { recordAuditEvent } from '../audit/audit.repo.js';
import { loginBodySchema } from './auth.schema.js';
import { verifyCredentials } from './auth.service.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', { config: { public: true } }, async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }

    const outcome = await verifyCredentials(parsed.data.username, parsed.data.password, request.ip);

    if (outcome.status === 'locked') {
      reply.code(429);
      await recordAuditEvent({
        actionKey: 'auth.login_locked',
        entityType: 'user',
        entityId: parsed.data.username,
        ipAddress: request.ip,
      });
      return { error: 'too_many_attempts' };
    }
    if (outcome.status === 'invalid_credentials') {
      reply.code(401);
      await recordAuditEvent({
        actionKey: 'auth.login_failed',
        entityType: 'user',
        entityId: parsed.data.username,
        ipAddress: request.ip,
      });
      return { error: 'invalid_credentials' };
    }

    const { user } = outcome;

    // Regenerate before writing the authenticated identity onto the
    // session: this rotates the session id on login (fixes the legacy's
    // complete absence of session-fixation protection), and doing it
    // first means the fresh session is what actually carries the user.
    await request.session.regenerate();
    request.session.userId = user.id;
    if (user.branchId !== null) {
      request.session.branchId = user.branchId;
    }

    await recordAuditEvent({
      actionKey: 'auth.login',
      entityType: 'user',
      entityId: String(user.id),
      userId: user.id,
      ipAddress: request.ip,
    });

    return { id: user.id, username: user.username };
  });

  app.post('/auth/logout', { config: { public: true } }, async (request, reply) => {
    const userId = request.session.userId;
    await request.session.destroy();
    reply.code(204);
    await recordAuditEvent({
      actionKey: 'auth.logout',
      entityType: 'user',
      entityId: typeof userId === 'number' ? String(userId) : undefined,
      userId,
      ipAddress: request.ip,
    });
    return null;
  });
}
