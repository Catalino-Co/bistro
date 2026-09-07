import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { cookieValue, findCookiePair, mergeCookies } from '../../test-support/http.js';
import { closeTestDbPool, createTestUser, deleteTestUser } from './test-helpers.repo.js';

const TEST_USERNAME = '__auth_test_user__';
const TEST_PASSWORD = 'CorrectHorseBatteryStaple1!';

async function primeCsrf(app: FastifyInstance) {
  const response = await app.inject({ method: 'GET', url: '/health' });
  const sessionCookie = findCookiePair(response.headers['set-cookie'], 'sessionId');
  const csrfCookie = findCookiePair(response.headers['set-cookie'], 'csrf');
  return {
    sessionCookie,
    cookie: mergeCookies(sessionCookie, csrfCookie),
    csrfToken: cookieValue(csrfCookie),
  };
}

describe('auth routes', () => {
  const app = buildApp();

  beforeAll(async () => {
    await createTestUser(TEST_USERNAME, TEST_PASSWORD);
  });

  afterAll(async () => {
    await deleteTestUser(TEST_USERNAME);
    await app.close();
    await closeTestDbPool();
  });

  it('rejects a login POST without a CSRF token even with valid credentials', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
    });

    expect(response.statusCode).toBe(403);
  });

  it('rejects an incorrect password without changing the caller into an authenticated session', async () => {
    const { cookie, csrfToken } = await primeCsrf(app);
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { username: TEST_USERNAME, password: 'wrong-password' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('regenerates the session id on successful login and sets an httpOnly cookie', async () => {
    const { sessionCookie: anonymousSessionCookie, cookie, csrfToken } = await primeCsrf(app);

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
    });

    expect(login.statusCode).toBe(200);
    const rawSetCookie = login.headers['set-cookie'];
    const setCookieList = Array.isArray(rawSetCookie) ? rawSetCookie : [rawSetCookie];
    expect(setCookieList.find((c) => c?.startsWith('sessionId='))).toContain('HttpOnly');

    const loggedInSessionCookie = findCookiePair(rawSetCookie, 'sessionId');
    expect(loggedInSessionCookie).not.toBe(anonymousSessionCookie);
  });

  it('destroys the session on logout', async () => {
    const { cookie, csrfToken } = await primeCsrf(app);
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
    });
    const sessionCookie = findCookiePair(login.headers['set-cookie'], 'sessionId');

    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: {
        cookie: mergeCookies(sessionCookie, `csrf=${csrfToken}`),
        'x-csrf-token': csrfToken,
      },
    });

    expect(logout.statusCode).toBe(204);
  });
});
