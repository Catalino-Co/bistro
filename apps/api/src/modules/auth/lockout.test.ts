import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { cookieValue, findCookiePair, mergeCookies } from '../../test-support/http.js';
import {
  closeTestDbPool,
  createTestUser,
  deleteLoginAttempts,
  deleteTestUser,
} from './test-helpers.repo.js';

const USERNAME = '__lockout_test_user__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';

describe('login lockout', () => {
  const app = buildApp();

  beforeAll(async () => {
    // Login attempts persist across runs against the real dev DB, so a
    // stale lockout from a previous run of *this* file must not leak into
    // this one. Scoped to this exact username -- safe alongside other test
    // files' suites running concurrently.
    await deleteLoginAttempts(USERNAME);
    await createTestUser(USERNAME, PASSWORD);
  });

  afterAll(async () => {
    await deleteLoginAttempts(USERNAME);
    await deleteTestUser(USERNAME);
    await app.close();
    await closeTestDbPool();
  });

  async function attemptLogin(password: string) {
    const primed = await app.inject({ method: 'GET', url: '/health' });
    const sessionCookie = findCookiePair(primed.headers['set-cookie'], 'sessionId');
    const csrfCookie = findCookiePair(primed.headers['set-cookie'], 'csrf');

    return app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: {
        cookie: mergeCookies(sessionCookie, csrfCookie),
        'x-csrf-token': cookieValue(csrfCookie),
      },
      payload: { username: USERNAME, password },
    });
  }

  it('locks the account after 6 consecutive failures, even for the correct password', async () => {
    for (let i = 0; i < 6; i++) {
      const response = await attemptLogin('wrong-password');
      expect(response.statusCode).toBe(401);
    }

    const lockedWithCorrectPassword = await attemptLogin(PASSWORD);
    expect(lockedWithCorrectPassword.statusCode).toBe(429);
  });
});
