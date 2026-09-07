import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import {
  closeTestDbPool,
  createTestUser,
  deleteTestUser,
} from '../modules/auth/test-helpers.repo.js';
import {
  createBranchFixture,
  deleteBranchFixture,
  grantAdminRole,
  type GuardFixture,
} from './guard.test-helpers.repo.js';

const USERNAME = '__guard_test_user__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';

function extractCookie(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!raw) {
    throw new Error('Expected a set-cookie header');
  }
  return raw.split(';')[0]!;
}

describe('guard plugin', () => {
  const app = buildApp();
  let fixture: GuardFixture;
  let userId: number;

  app.get('/__test/no-config__', async () => ({ ok: true }));
  app.get('/__test/public__', { config: { public: true } }, async () => ({ ok: true }));
  app.get('/__test/authenticated-only__', { config: { permissions: [] } }, async () => ({
    ok: true,
  }));
  app.get(
    '/__test/needs-permission__',
    { config: { permissions: ['system.roles.manage'] } },
    async () => ({ ok: true }),
  );

  beforeAll(async () => {
    userId = await createTestUser(USERNAME, PASSWORD);
    fixture = await createBranchFixture();
  });

  afterAll(async () => {
    await deleteBranchFixture(fixture);
    await deleteTestUser(USERNAME);
    await app.close();
    await closeTestDbPool();
  });

  async function loginCookie(): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: USERNAME, password: PASSWORD },
    });
    return extractCookie(response.headers['set-cookie']);
  }

  it('denies a route that declares neither public nor permissions', async () => {
    const response = await app.inject({ method: 'GET', url: '/__test/no-config__' });
    expect(response.statusCode).toBe(403);
  });

  it('allows a public route without authentication', async () => {
    const response = await app.inject({ method: 'GET', url: '/__test/public__' });
    expect(response.statusCode).toBe(200);
  });

  it('requires authentication for an authenticated-only route', async () => {
    const anonymous = await app.inject({ method: 'GET', url: '/__test/authenticated-only__' });
    expect(anonymous.statusCode).toBe(401);

    const cookie = await loginCookie();
    const authenticated = await app.inject({
      method: 'GET',
      url: '/__test/authenticated-only__',
      headers: { cookie },
    });
    expect(authenticated.statusCode).toBe(200);
  });

  it('denies an authenticated user lacking the required permission', async () => {
    const cookie = await loginCookie();
    const response = await app.inject({
      method: 'GET',
      url: '/__test/needs-permission__',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it('allows an authenticated user holding the required permission', async () => {
    await grantAdminRole(userId, fixture.branchId);
    const cookie = await loginCookie();
    const response = await app.inject({
      method: 'GET',
      url: '/__test/needs-permission__',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
  });
});
