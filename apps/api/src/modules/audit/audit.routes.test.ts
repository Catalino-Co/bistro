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

const USERNAME = '__audit_routes_test_user__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';

interface AuditEntry {
  id: number;
  actionKey: string;
  entityType: string | null;
  entityId: string | null;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  userId: number | null;
  userName: string | null;
  username: string | null;
  branchId: number | null;
  branchName: string | null;
  createdAt: string;
}
interface AuditPage {
  entries: AuditEntry[];
  nextCursor: number | null;
}

describe('audit trail reads', () => {
  const app = buildApp();
  let branch: BranchFixture;
  let cookie: string;
  let csrfToken: string;
  let userId: number;
  let roleId = 0;

  async function audit(query = ''): Promise<AuditPage> {
    const response = await app.inject({
      method: 'GET',
      url: `/audit${query}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    return response.json() as AuditPage;
  }

  beforeAll(async () => {
    userId = await createTestUser(USERNAME, PASSWORD);
    branch = await createBranchFixture('audit-routes');
    await assignRole(userId, 'admin', branch.branchId);

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

    await app.inject({
      method: 'POST',
      url: '/branches/select',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { branchId: branch.branchId },
    });

    // Un evento con `before`/`after` que auditar de verdad.
    const role = await app.inject({
      method: 'POST',
      url: '/rbac/roles',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { name: '__audit_routes_test_role__' },
    });
    roleId = (role.json() as { role: { id: number } }).role.id;
  });

  afterAll(async () => {
    await deleteBranchFixture(branch);
    await deleteTestUser(USERNAME);
    await app.close();
    await closeTestDbPool();
  });

  it('returns who did what, newest first, with the actor resolved', async () => {
    const page = await audit();
    expect(page.entries.length).toBeGreaterThan(0);

    const ids = page.entries.map((entry) => entry.id);
    expect([...ids].sort((a, b) => b - a)).toEqual(ids);

    const created = page.entries.find(
      (entry) => entry.actionKey === 'rbac.role_created' && entry.entityId === String(roleId),
    );
    expect(created).toBeDefined();
    expect(created).toMatchObject({
      entityType: 'role',
      userId,
      username: USERNAME,
      afterData: { name: '__audit_routes_test_role__' },
    });
  });

  it('includes the branch-less system events alongside the branch ones', async () => {
    const page = await audit('?limit=200');
    // El login no pertenece a ninguna sucursal...
    const login = page.entries.find((entry) => entry.actionKey === 'auth.login');
    expect(login).toBeDefined();
    expect(login?.branchId).toBeNull();
    // ...y la selección de sucursal sí.
    const selected = page.entries.find((entry) => entry.actionKey === 'branch.selected');
    expect(selected?.branchId).toBe(branch.branchId);
  });

  it('filters by action and by free text', async () => {
    const byAction = await audit('?actionKey=rbac.role_created');
    expect(byAction.entries.length).toBeGreaterThan(0);
    expect(byAction.entries.every((entry) => entry.actionKey === 'rbac.role_created')).toBe(true);

    const byActor = await audit(`?search=${encodeURIComponent(USERNAME)}`);
    expect(byActor.entries.length).toBeGreaterThan(0);
    expect(byActor.entries.every((entry) => entry.username === USERNAME)).toBe(true);

    expect((await audit('?search=__no_aparece_en_ninguna_parte__')).entries).toEqual([]);
  });

  it('pages with a keyset cursor instead of an offset', async () => {
    const first = await audit('?limit=1');
    expect(first.entries).toHaveLength(1);
    expect(first.nextCursor).toBe(first.entries[0]!.id);

    const second = await audit(`?limit=1&cursor=${first.nextCursor}`);
    expect(second.entries).toHaveLength(1);
    // La segunda página no repite la primera y sigue bajando por id.
    expect(second.entries[0]!.id).toBeLessThan(first.entries[0]!.id);

    // Una página que agota el listado no ofrece cursor siguiente.
    const all = await audit('?limit=200');
    expect(all.nextCursor).toBeNull();
  });

  it('filters by date range', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    expect((await audit(`?from=${tomorrow}`)).entries).toEqual([]);

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect((await audit(`?from=${yesterday}`)).entries.length).toBeGreaterThan(0);
  });

  it('lists the action keys actually present, for the filter', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/audit/actions',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const { actionKeys } = response.json() as { actionKeys: string[] };
    expect(actionKeys).toContain('rbac.role_created');
    expect(actionKeys).toContain('auth.login');
    expect([...actionKeys].sort()).toEqual(actionKeys);
  });

  it('exposes no way to write or delete an entry', async () => {
    for (const method of ['POST', 'DELETE', 'PATCH'] as const) {
      const response = await app.inject({
        method,
        url: '/audit',
        headers: { cookie, 'x-csrf-token': csrfToken },
        payload: { actionKey: 'inventado' },
      });
      // Una bitácora que se puede editar desde la app no es una bitácora.
      expect(response.statusCode).toBe(404);
    }
  });
});
