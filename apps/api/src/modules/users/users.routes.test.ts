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
import { findRoleIdByName } from './users.test-helpers.repo.js';

const USERNAME = '__users_test_user__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';
const NEW_USERNAME = '__users_test_created__';
const NEW_PASSWORD = 'UnaClaveDeDiez1!';

interface UserRow {
  id: number;
  username: string;
  fullName: string;
  status: string;
  roles: { roleId: number; roleName: string; branchId: number; branchName: string }[];
}

describe('users administration', () => {
  const app = buildApp();
  let branch: BranchFixture;
  let cookie: string;
  let csrfToken: string;
  let adminRoleId: number;
  let createdUserId: number;

  async function listUsers(): Promise<UserRow[]> {
    const response = await app.inject({ method: 'GET', url: '/users', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    return (response.json() as { users: UserRow[] }).users;
  }

  beforeAll(async () => {
    const userId = await createTestUser(USERNAME, PASSWORD);
    branch = await createBranchFixture('users');
    await assignRole(userId, 'admin', branch.branchId);
    adminRoleId = await findRoleIdByName('admin');

    const primed = await app.inject({ method: 'GET', url: '/health' });
    const sessionCookie = findCookiePair(primed.headers['set-cookie'], 'sessionId');
    const csrfCookie = findCookiePair(primed.headers['set-cookie'], 'csrf');
    csrfToken = cookieValue(csrfCookie);
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { cookie: mergeCookies(sessionCookie, csrfCookie), 'x-csrf-token': csrfToken },
      payload: { username: USERNAME, password: PASSWORD },
    });
    cookie = mergeCookies(findCookiePair(login.headers['set-cookie'], 'sessionId'), csrfCookie);
  });

  afterAll(async () => {
    await deleteTestUser(NEW_USERNAME);
    await deleteBranchFixture(branch);
    await deleteTestUser(USERNAME);
    await app.close();
    await closeTestDbPool();
  });

  it('creates an employee, and never returns its password hash', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/users',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: {
        username: NEW_USERNAME,
        fullName: 'Empleado de Prueba',
        password: NEW_PASSWORD,
      },
    });
    expect(created.statusCode).toBe(201);
    const body = created.json() as { user: UserRow & { passwordHash?: string } };
    createdUserId = body.user.id;
    expect(body.user.username).toBe(NEW_USERNAME);
    expect(created.body).not.toContain('passwordHash');
    expect(created.body).not.toContain(NEW_PASSWORD);

    const users = await listUsers();
    const created2 = users.find((u) => u.username === NEW_USERNAME);
    expect(created2).toMatchObject({ fullName: 'Empleado de Prueba', status: 'active' });
    // Un usuario recién creado no puede hacer nada todavía: sin rol asignado
    // no tiene permisos en ninguna sucursal.
    expect(created2?.roles).toEqual([]);
  });

  it('rejects a duplicate username', async () => {
    const duplicate = await app.inject({
      method: 'POST',
      url: '/users',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { username: NEW_USERNAME, fullName: 'Otro', password: NEW_PASSWORD },
    });
    expect(duplicate.statusCode).toBe(409);
    expect((duplicate.json() as { error: string }).error).toBe('username_taken');
  });

  it('rejects a password under ten characters', async () => {
    const weak = await app.inject({
      method: 'POST',
      url: '/users',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { username: '__users_test_weak__', fullName: 'Débil', password: 'corta123' },
    });
    expect(weak.statusCode).toBe(400);
  });

  it('assigns and revokes a role scoped to one branch', async () => {
    const assign = await app.inject({
      method: 'POST',
      url: `/users/${createdUserId}/roles`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { roleId: adminRoleId, branchId: branch.branchId },
    });
    expect(assign.statusCode).toBe(204);

    const withRole = (await listUsers()).find((u) => u.id === createdUserId);
    expect(withRole?.roles).toHaveLength(1);
    expect(withRole?.roles[0]).toMatchObject({
      roleId: adminRoleId,
      branchId: branch.branchId,
      roleName: 'admin',
    });

    // Repetir la asignación es idempotente, no un error.
    const again = await app.inject({
      method: 'POST',
      url: `/users/${createdUserId}/roles`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { roleId: adminRoleId, branchId: branch.branchId },
    });
    expect(again.statusCode).toBe(204);
    expect((await listUsers()).find((u) => u.id === createdUserId)?.roles).toHaveLength(1);

    const revoke = await app.inject({
      method: 'DELETE',
      url: `/users/${createdUserId}/roles/${adminRoleId}/branches/${branch.branchId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(revoke.statusCode).toBe(204);
    expect((await listUsers()).find((u) => u.id === createdUserId)?.roles).toEqual([]);
  });

  it('refuses to assign a role that does not exist', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/users/${createdUserId}/roles`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { roleId: 99_999_999, branchId: branch.branchId },
    });
    expect(response.statusCode).toBe(404);
    expect((response.json() as { error: string }).error).toBe('role_not_found');
  });

  it('deactivates an employee and resets its password', async () => {
    const deactivate = await app.inject({
      method: 'PATCH',
      url: `/users/${createdUserId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { status: 'inactive' },
    });
    expect(deactivate.statusCode).toBe(204);
    expect((await listUsers()).find((u) => u.id === createdUserId)?.status).toBe('inactive');

    const reset = await app.inject({
      method: 'POST',
      url: `/users/${createdUserId}/password`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { password: 'OtraClaveLarga9!' },
    });
    expect(reset.statusCode).toBe(204);

    const missing = await app.inject({
      method: 'PATCH',
      url: '/users/99999999',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { status: 'active' },
    });
    expect(missing.statusCode).toBe(404);
  });
});
