import fastifyCookie from '@fastify/cookie';
import fastifySession, { type SessionStore } from '@fastify/session';
import type { Session } from 'fastify';
import fp from 'fastify-plugin';
import { deleteSession, findSession, upsertSession } from '../modules/session/session.repo.js';

const DEFAULT_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12h idle timeout, refined in B1/B3 with shift-based expiry

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

class PgSessionStore implements SessionStore {
  set(sessionId: string, session: Session, callback: (err?: unknown) => void): void {
    const expiresAt = session.cookie.expires ?? new Date(Date.now() + DEFAULT_MAX_AGE_MS);
    upsertSession(sessionId, session as unknown as Record<string, unknown>, expiresAt)
      .then(() => callback())
      .catch(callback);
  }

  get(sessionId: string, callback: (err: unknown, session?: Session | null) => void): void {
    findSession(sessionId)
      .then((row) => callback(null, (row?.data as Session | undefined) ?? null))
      .catch(callback);
  }

  destroy(sessionId: string, callback: (err?: unknown) => void): void {
    deleteSession(sessionId)
      .then(() => callback())
      .catch(callback);
  }
}

export default fp(async function sessionPlugin(app) {
  await app.register(fastifyCookie);
  await app.register(fastifySession, {
    secret: requireEnv('SESSION_SECRET'),
    store: new PgSessionStore(),
    cookie: {
      httpOnly: true,
      // Secure cookies aren't sent over plain HTTP, which is how local dev
      // runs -- only require it once the app is actually served over TLS.
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: DEFAULT_MAX_AGE_MS,
    },
  });
});
