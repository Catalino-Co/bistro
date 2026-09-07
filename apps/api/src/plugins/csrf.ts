import crypto from 'node:crypto';
import fp from 'fastify-plugin';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSRF_COOKIE = 'csrf';
const CSRF_HEADER = 'x-csrf-token';

// Double-submit cookie: the token lives only in a non-httpOnly cookie (so
// the frontend can read it and echo it back) and is compared to a header
// the caller must set explicitly. A cross-site form/img/fetch triggers the
// browser to attach cookies automatically, but same-origin policy stops it
// from reading the cookie's value to put in the header -- the legacy had
// zero CSRF tokens anywhere, so `<img src="...rest_cancel_invoice.php?...">`
// was a working attack.
export default fp(async function csrfPlugin(app) {
  app.addHook('onRequest', async (request, reply) => {
    if (request.is404) {
      return;
    }

    let token = request.cookies[CSRF_COOKIE];
    if (!token) {
      token = crypto.randomBytes(32).toString('hex');
      reply.setCookie(CSRF_COOKIE, token, {
        httpOnly: false,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      });
    }

    if (MUTATING_METHODS.has(request.method)) {
      const header = request.headers[CSRF_HEADER];
      if (typeof header !== 'string' || header !== token) {
        reply.code(403);
        return reply.send({ error: 'invalid_csrf_token' });
      }
    }
  });
});
