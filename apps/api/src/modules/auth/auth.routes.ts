import type { FastifyInstance } from 'fastify';
import { loginBodySchema } from './auth.schema.js';
import { verifyCredentials } from './auth.service.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', { config: { public: true } }, async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }

    const user = await verifyCredentials(parsed.data.username, parsed.data.password);
    if (!user) {
      reply.code(401);
      return { error: 'invalid_credentials' };
    }

    // Regenerate before writing the authenticated identity onto the
    // session: this rotates the session id on login (fixes the legacy's
    // complete absence of session-fixation protection), and doing it
    // first means the fresh session is what actually carries the user.
    await request.session.regenerate();
    request.session.userId = user.id;
    if (user.branchId !== null) {
      request.session.branchId = user.branchId;
    }

    return { id: user.id, username: user.username };
  });

  app.post('/auth/logout', { config: { public: true } }, async (request, reply) => {
    await request.session.destroy();
    reply.code(204);
    return null;
  });
}
