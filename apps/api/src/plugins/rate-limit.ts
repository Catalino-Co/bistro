import rateLimit from '@fastify/rate-limit';
import fp from 'fastify-plugin';

// Blunt, global flood protection per IP. The login-specific brute-force
// defense (per-username lockout after repeated failures) lives in
// auth.service.ts against the DB -- this is a coarser, cheaper first line
// that the legacy had none of on any endpoint.
export default fp(async function rateLimitPlugin(app) {
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
  });
});
