import fp from 'fastify-plugin';
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

    if (!Array.isArray(config.permissions)) {
      reply.code(403);
      return reply.send({ error: 'forbidden' });
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
      reply.code(403);
      return reply.send({ error: 'forbidden' });
    }
  });
});
