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
import { createDineArea, createDineTable } from '../floor/floor.repo.js';

const USERNAME = '__orders_test_user__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';

describe('orders routes', () => {
  const app = buildApp();
  let branch: BranchFixture;
  let dineAreaId: number;
  let cookie: string;
  let csrfToken: string;

  beforeAll(async () => {
    const userId = await createTestUser(USERNAME, PASSWORD);
    branch = await createBranchFixture('orders');
    await assignRole(userId, 'admin', branch.branchId);
    dineAreaId = (await createDineArea(branch.branchId, '__orders_test_area__')).id;

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
  });

  afterAll(async () => {
    // deleteBranchFixture's safety net sweeps orders, tables, and areas
    // scoped to this branch -- no need to track/delete them individually.
    await deleteBranchFixture(branch);
    await deleteTestUser(USERNAME);
    await app.close();
    await closeTestDbPool();
  });

  it('opens an order on an available table, marking it occupied, then closing frees it', async () => {
    const table = await createDineTable(dineAreaId, '__orders_test_table__', 4);

    const open = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { dineTableId: table.id },
    });
    expect(open.statusCode).toBe(201);
    const orderId = (open.json() as { order: { id: number } }).order.id;

    const forTable = await app.inject({
      method: 'GET',
      url: `/orders/for-table/${table.id}`,
      headers: { cookie },
    });
    expect((forTable.json() as { order: { id: number } | null }).order?.id).toBe(orderId);

    const secondOpen = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { dineTableId: table.id },
    });
    expect(secondOpen.statusCode).toBe(409);
    expect((secondOpen.json() as { error: string }).error).toBe('table_occupied');

    const close = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/close`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(close.statusCode).toBe(204);

    const forTableAfterClose = await app.inject({
      method: 'GET',
      url: `/orders/for-table/${table.id}`,
      headers: { cookie },
    });
    expect((forTableAfterClose.json() as { order: unknown }).order).toBeNull();

    // The table is available again, so a fresh order can be opened on it.
    const reopen = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { dineTableId: table.id },
    });
    expect(reopen.statusCode).toBe(201);
    const reopenedId = (reopen.json() as { order: { id: number } }).order.id;

    const closeAgain = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/close`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(closeAgain.statusCode).toBe(409);
    expect((closeAgain.json() as { error: string }).error).toBe('already_closed');

    await app.inject({
      method: 'POST',
      url: `/orders/${reopenedId}/close`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
  });

  it('returns order detail with the dine table name and a null customer for dine_in', async () => {
    const table = await createDineTable(dineAreaId, '__orders_test_table_detail__', 2);
    const open = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { dineTableId: table.id },
    });
    const orderId = (open.json() as { order: { id: number } }).order.id;

    const detail = await app.inject({
      method: 'GET',
      url: `/orders/${orderId}`,
      headers: { cookie },
    });
    expect(detail.statusCode).toBe(200);
    expect((detail.json() as { order: unknown }).order).toMatchObject({
      id: orderId,
      dispatchMode: 'dine_in',
      dineTableName: '__orders_test_table_detail__',
      customerName: null,
    });
  });

  it('returns order_not_found for a nonexistent order id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/orders/999999999',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(404);
    expect((response.json() as { error: string }).error).toBe('order_not_found');
  });

  it('rejects opening an order on a table from another branch', async () => {
    const otherBranch = await createBranchFixture('orders-other');
    const otherArea = await createDineArea(otherBranch.branchId, '__orders_test_area_other__');
    const otherTable = await createDineTable(otherArea.id, '__orders_test_table_other__', 2);

    const response = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { dineTableId: otherTable.id },
    });
    expect(response.statusCode).toBe(404);

    await deleteBranchFixture(otherBranch);
  });
});
