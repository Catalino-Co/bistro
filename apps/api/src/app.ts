import Fastify, { type FastifyInstance } from 'fastify';
import { authRoutes } from './modules/auth/auth.routes.js';
import csrfPlugin from './plugins/csrf.js';
import guardPlugin from './plugins/guard.js';
import sessionPlugin from './plugins/session.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: true,
  });

  app.register(sessionPlugin);
  app.register(csrfPlugin);
  app.register(guardPlugin);
  app.register(authRoutes);

  app.get('/health', { config: { public: true } }, async () => ({ status: 'ok' }));

  return app;
}
