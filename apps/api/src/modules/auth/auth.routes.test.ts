import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { closeTestDbPool, createTestUser, deleteTestUser } from './test-helpers.repo.js';

const TEST_USERNAME = '__auth_test_user__';
const TEST_PASSWORD = 'CorrectHorseBatteryStaple1!';

function extractCookie(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!raw) {
    throw new Error('Expected a set-cookie header');
  }
  return raw.split(';')[0]!;
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

  it('rejects an incorrect password without changing the caller into an authenticated session', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: TEST_USERNAME, password: 'wrong-password' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('regenerates the session id on successful login and sets an httpOnly cookie', async () => {
    const anonymous = await app.inject({ method: 'GET', url: '/health' });
    const anonymousCookie = extractCookie(anonymous.headers['set-cookie']);

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { cookie: anonymousCookie },
      payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
    });

    expect(login.statusCode).toBe(200);
    const rawSetCookie = login.headers['set-cookie'];
    const setCookie = Array.isArray(rawSetCookie) ? rawSetCookie[0] : rawSetCookie;
    expect(setCookie).toContain('HttpOnly');

    const loggedInCookie = extractCookie(rawSetCookie);
    expect(loggedInCookie).not.toBe(anonymousCookie);
  });

  it('destroys the session on logout', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
    });
    const cookie = extractCookie(login.headers['set-cookie']);

    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie },
    });

    expect(logout.statusCode).toBe(204);
  });
});
