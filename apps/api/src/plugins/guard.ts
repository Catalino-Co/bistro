import fp from 'fastify-plugin';
import { recordAuditEvent } from '../modules/audit/audit.repo.js';
import { getUserPermissionKeys } from '../modules/guard/guard.repo.js';

// Deny-by-default: the legacy system had this exact inversion (93 of 95
// AJAX endpoints had zero session check because protecting a route was
// opt-in per file). Here, a route that never declares its access
// requirements is refused outright -- there's no "forgot to guard this"
// failure mode, only a route that's broken until it declares one.
export default fp(async function guardPlugin(app) {
  app.addHook('onRequest', async (request, reply) => {
    if (request.is404) {
      return;
    }

    const config = request.routeOptions.config;

    if (config.public === true) {
      return;
    }

    async function denyForbidden(reason: 'no_config' | 'missing_permission') {
      reply.code(403);
      await recordAuditEvent({
        actionKey: 'guard.denied',
        entityType: 'route',
        entityId: request.url,
        afterData: { reason, method: request.method },
        userId: typeof request.session.userId === 'number' ? request.session.userId : undefined,
        ipAddress: request.ip,
      });
      return reply.send({ error: 'forbidden' });
    }

    if (!Array.isArray(config.permissions)) {
      return denyForbidden('no_config');
    }

    const userId = request.session.userId;
    if (typeof userId !== 'number') {
      reply.code(401);
      return reply.send({ error: 'unauthenticated' });
    }

    if (config.permissions.length === 0) {
      return;
    }

    const granted = await getUserPermissionKeys(userId);
    const hasRequiredPermission = config.permissions.some((key) => granted.has(key));
    if (!hasRequiredPermission) {
      return denyForbidden('missing_permission');
    }
  });
});
