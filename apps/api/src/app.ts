import Fastify, { type FastifyInstance } from 'fastify';
import { authRoutes } from './modules/auth/auth.routes.js';
import { branchesRoutes } from './modules/branches/branches.routes.js';
import { catalogRoutes } from './modules/catalog/catalog.routes.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { rbacRoutes } from './modules/rbac/rbac.routes.js';
import csrfPlugin from './plugins/csrf.js';
import guardPlugin from './plugins/guard.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import sessionPlugin from './plugins/session.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: true,
  });

  // Plugins that hook into onRoute (rate-limit) must finish registering
  // before ANY route is declared -- onRoute only wraps routes added *after*
  // the hook attaches, and a bare app.get()/post() on the root instance runs
  // synchronously, ahead of queued (even unawaited) plugin registrations.
  // Routing every route through its own registered plugin, exactly like
  // authRoutes, keeps them all correctly sequenced by avvio regardless.
  app.register(rateLimitPlugin);
  app.register(sessionPlugin);
  app.register(csrfPlugin);
  app.register(guardPlugin);
  app.register(authRoutes);
  app.register(branchesRoutes);
  app.register(rbacRoutes);
  app.register(catalogRoutes);
  app.register(healthRoutes);

  return app;
}
