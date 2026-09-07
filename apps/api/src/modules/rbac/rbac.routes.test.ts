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
} from '../branches/branches.test-helpers.repo.js';
import { deleteTestRole } from './rbac.test-helpers.repo.js';

const USERNAME = '__rbac_routes_test_admin__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';
const NEW_ROLE_NAME = '__rbac_routes_test_role__';

async function loginAs(app: FastifyInstance, username: string) {
  const primed = await app.inject({ method: 'GET', url: '/health' });
  const sessionCookie = findCookiePair(primed.headers['set-cookie'], 'sessionId');
  const csrfCookie = findCookiePair(primed.headers['set-cookie'], 'csrf');
  const csrfToken = cookieValue(csrfCookie);
  const loginResponse = await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers: { cookie: mergeCookies(sessionCookie, csrfCookie), 'x-csrf-token': csrfToken },
    payload: { username, password: PASSWORD },
  });
  const loggedInSessionCookie = findCookiePair(loginResponse.headers['set-cookie'], 'sessionId');
  return { cookie: mergeCookies(loggedInSessionCookie, csrfCookie), csrfToken };
}

describe('rbac routes', () => {
  const app = buildApp();
  let branch: BranchFixture;
  let createdRoleId: number;
  let rolesManagePermissionId: number;

  beforeAll(async () => {
    const userId = await createTestUser(USERNAME, PASSWORD);
    branch = await createBranchFixture('rbac');
    await assignRole(userId, 'admin', branch.branchId);
  });

  afterAll(async () => {
    if (createdRoleId) {
      await deleteTestRole(createdRoleId);
    }
    await deleteBranchFixture(branch);
    await deleteTestUser(USERNAME);
    await app.close();
    await closeTestDbPool();
  });

  it('denies rbac routes to a user without system.roles.manage', async () => {
    const outsider = '__rbac_routes_test_outsider__';
    await createTestUser(outsider, PASSWORD);
    const { cookie } = await loginAs(app, outsider);

    const response = await app.inject({ method: 'GET', url: '/rbac/roles', headers: { cookie } });
    expect(response.statusCode).toBe(403);

    await deleteTestUser(outsider);
  });

  it('creates a role, lists it, and lists the permission catalog', async () => {
    const { cookie, csrfToken } = await loginAs(app, USERNAME);

    const created = await app.inject({
      method: 'POST',
      url: '/rbac/roles',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { name: NEW_ROLE_NAME },
    });
    expect(created.statusCode).toBe(201);
    createdRoleId = (created.json() as { role: { id: number } }).role.id;

    const roles = await app.inject({ method: 'GET', url: '/rbac/roles', headers: { cookie } });
    const roleNames = (roles.json() as { roles: { name: string }[] }).roles.map((r) => r.name);
    expect(roleNames).toContain(NEW_ROLE_NAME);

    const permissionsResponse = await app.inject({
      method: 'GET',
      url: '/rbac/permissions',
      headers: { cookie },
    });
    const permissions = (
      permissionsResponse.json() as { permissions: { id: number; key: string }[] }
    ).permissions;
    expect(permissions.map((p) => p.key)).toContain('system.roles.manage');
    rolesManagePermissionId = permissions.find((p) => p.key === 'system.roles.manage')!.id;
  });

  it('grants then revokes a permission, changing what the guard allows in real time', async () => {
    const { cookie, csrfToken } = await loginAs(app, USERNAME);

    // A throwaway user holding *only* the new (still permission-less) role
    // -- proves the guard reads the role's live permission set, not
    // something decided at login time.
    const subject = '__rbac_routes_test_subject__';
    const subjectUserId = await createTestUser(subject, PASSWORD);
    await assignRole(subjectUserId, NEW_ROLE_NAME, branch.branchId);

    async function subjectCanReachRbacRoles(): Promise<number> {
      const { cookie: subjectCookie } = await loginAs(app, subject);
      const response = await app.inject({
        method: 'GET',
        url: '/rbac/roles',
        headers: { cookie: subjectCookie },
      });
      return response.statusCode;
    }

    expect(await subjectCanReachRbacRoles()).toBe(403);

    const grant = await app.inject({
      method: 'POST',
      url: `/rbac/roles/${createdRoleId}/permissions`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { permissionId: rolesManagePermissionId },
    });
    expect(grant.statusCode).toBe(204);
    expect(await subjectCanReachRbacRoles()).toBe(200);

    const revoke = await app.inject({
      method: 'DELETE',
      url: `/rbac/roles/${createdRoleId}/permissions/${rolesManagePermissionId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(revoke.statusCode).toBe(204);
    expect(await subjectCanReachRbacRoles()).toBe(403);

    await deleteTestUser(subject);
  });
});
