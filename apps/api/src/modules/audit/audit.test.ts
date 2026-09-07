import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { cookieValue, findCookiePair, mergeCookies } from '../../test-support/http.js';
import { closeTestDbPool, createTestUser, deleteTestUser } from '../auth/test-helpers.repo.js';
import { findAuditEvents } from './audit.repo.js';

const USERNAME = '__audit_test_user__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';

describe('audit trail', () => {
  const app = buildApp();
  let userId: number;

  app.get('/__audit_test/no-config__', async () => ({ ok: true }));

  beforeAll(async () => {
    userId = await createTestUser(USERNAME, PASSWORD);
  });

  afterAll(async () => {
    await deleteTestUser(USERNAME);
    await app.close();
    await closeTestDbPool();
  });

  it('records a login', async () => {
    const primed = await app.inject({ method: 'GET', url: '/health' });
    const sessionCookie = findCookiePair(primed.headers['set-cookie'], 'sessionId');
    const csrfCookie = findCookiePair(primed.headers['set-cookie'], 'csrf');

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: {
        cookie: mergeCookies(sessionCookie, csrfCookie),
        'x-csrf-token': cookieValue(csrfCookie),
      },
      payload: { username: USERNAME, password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);

    const events = await findAuditEvents('auth.login', String(userId));
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.userId).toBe(userId);
  });

  it('records a guard denial', async () => {
    const response = await app.inject({ method: 'GET', url: '/__audit_test/no-config__' });
    expect(response.statusCode).toBe(403);

    const events = await findAuditEvents('guard.denied', '/__audit_test/no-config__');
    expect(events.length).toBeGreaterThan(0);
  });
});
