import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { cookieValue, findCookiePair, mergeCookies } from '../../test-support/http.js';
import { closeTestDbPool, createTestUser, deleteTestUser } from '../auth/test-helpers.repo.js';
import {
  assignRole,
  createBranchFixture,
  deleteBranchFixture,
  type BranchFixture,
} from './branches.test-helpers.repo.js';

const USERNAME = '__branches_test_user__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';

async function login(app: FastifyInstance) {
  const primed = await app.inject({ method: 'GET', url: '/health' });
  const sessionCookie = findCookiePair(primed.headers['set-cookie'], 'sessionId');
  const csrfCookie = findCookiePair(primed.headers['set-cookie'], 'csrf');
  const csrfToken = cookieValue(csrfCookie);

  const loginResponse = await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers: { cookie: mergeCookies(sessionCookie, csrfCookie), 'x-csrf-token': csrfToken },
    payload: { username: USERNAME, password: PASSWORD },
  });
  const loggedInSessionCookie = findCookiePair(loginResponse.headers['set-cookie'], 'sessionId');
  return { cookie: mergeCookies(loggedInSessionCookie, csrfCookie), csrfToken };
}

describe('branches routes', () => {
  const app = buildApp();
  let userId: number;
  let branchA: BranchFixture;
  let branchB: BranchFixture;
  let outsideBranch: BranchFixture;

  beforeAll(async () => {
    userId = await createTestUser(USERNAME, PASSWORD);
    branchA = await createBranchFixture('a');
    branchB = await createBranchFixture('b');
    outsideBranch = await createBranchFixture('outside');
    await assignRole(userId, 'admin', branchA.branchId);
    await assignRole(userId, 'admin', branchB.branchId);
  });

  afterAll(async () => {
    await deleteBranchFixture(branchA);
    await deleteBranchFixture(branchB);
    await deleteBranchFixture(outsideBranch);
    await deleteTestUser(USERNAME);
    await app.close();
    await closeTestDbPool();
  });

  it('lists only the branches the user has a role in', async () => {
    const { cookie } = await login(app);
    const response = await app.inject({
      method: 'GET',
      url: '/branches/mine',
      headers: { cookie },
    });
    const body = response.json() as { branches: { id: number }[] };
    const ids = body.branches.map((b) => b.id).sort((a, b) => a - b);

    expect(ids).toEqual([branchA.branchId, branchB.branchId].sort((a, b) => a - b));
    expect(ids).not.toContain(outsideBranch.branchId);
  });

  it('rejects selecting a branch the user has no role in', async () => {
    const { cookie, csrfToken } = await login(app);
    const response = await app.inject({
      method: 'POST',
      url: '/branches/select',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { branchId: outsideBranch.branchId },
    });
    expect(response.statusCode).toBe(403);
  });

  it('switches the active branch and reflects it in /auth/me', async () => {
    const { cookie, csrfToken } = await login(app);

    const select = await app.inject({
      method: 'POST',
      url: '/branches/select',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { branchId: branchB.branchId },
    });
    expect(select.statusCode).toBe(200);

    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } });
    const meBody = me.json() as { branchId: number | null };
    expect(meBody.branchId).toBe(branchB.branchId);
  });
});
