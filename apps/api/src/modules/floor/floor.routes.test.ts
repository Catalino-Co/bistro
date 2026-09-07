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

const USERNAME = '__floor_test_user__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';

describe('floor routes', () => {
  const app = buildApp();
  let branchA: BranchFixture;
  let branchB: BranchFixture;
  let cookie: string;
  let csrfToken: string;

  beforeAll(async () => {
    const userId = await createTestUser(USERNAME, PASSWORD);
    branchA = await createBranchFixture('floor-a');
    branchB = await createBranchFixture('floor-b');
    await assignRole(userId, 'admin', branchA.branchId);
    await assignRole(userId, 'admin', branchB.branchId);

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
    await deleteBranchFixture(branchA);
    await deleteBranchFixture(branchB);
    await deleteTestUser(USERNAME);
    await app.close();
    await closeTestDbPool();
  });

  it('requires a selected branch before listing or creating a dine area', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/floor/dine-areas',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(409);
  });

  it('creates, edits, and deletes a dine area and a table, scoped to the active branch', async () => {
    await app.inject({
      method: 'POST',
      url: '/branches/select',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { branchId: branchA.branchId },
    });

    const createArea = await app.inject({
      method: 'POST',
      url: '/floor/dine-areas',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { name: '__floor_test_area__' },
    });
    expect(createArea.statusCode).toBe(201);
    const areaId = (createArea.json() as { dineArea: { id: number } }).dineArea.id;

    const rename = await app.inject({
      method: 'PATCH',
      url: `/floor/dine-areas/${areaId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { name: '__floor_test_area_renamed__' },
    });
    expect(rename.statusCode).toBe(204);

    const listForA = await app.inject({
      method: 'GET',
      url: '/floor/dine-areas',
      headers: { cookie },
    });
    const areaNames = (listForA.json() as { dineAreas: { name: string }[] }).dineAreas.map(
      (a) => a.name,
    );
    expect(areaNames).toEqual(['__floor_test_area_renamed__']);

    // Switching to the sibling branch must not see branch A's area.
    await app.inject({
      method: 'POST',
      url: '/branches/select',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { branchId: branchB.branchId },
    });
    const listForB = await app.inject({
      method: 'GET',
      url: '/floor/dine-areas',
      headers: { cookie },
    });
    expect((listForB.json() as { dineAreas: unknown[] }).dineAreas).toHaveLength(0);

    // Switch back to create/edit/delete a table under branch A's area.
    await app.inject({
      method: 'POST',
      url: '/branches/select',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { branchId: branchA.branchId },
    });

    const createTable = await app.inject({
      method: 'POST',
      url: '/floor/tables',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { dineAreaId: areaId, name: '__floor_test_table__', seats: 4 },
    });
    expect(createTable.statusCode).toBe(201);
    const tableId = (createTable.json() as { table: { id: number } }).table.id;

    const renameTable = await app.inject({
      method: 'PATCH',
      url: `/floor/tables/${tableId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { name: '__floor_test_table_renamed__', seats: 6 },
    });
    expect(renameTable.statusCode).toBe(204);

    const tables = await app.inject({
      method: 'GET',
      url: `/floor/tables?dineAreaId=${areaId}`,
      headers: { cookie },
    });
    const table = (tables.json() as { tables: { name: string; seats: number }[] }).tables[0];
    expect(table?.name).toBe('__floor_test_table_renamed__');
    expect(table?.seats).toBe(6);

    const deleteTable = await app.inject({
      method: 'DELETE',
      url: `/floor/tables/${tableId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(deleteTable.statusCode).toBe(204);

    const deleteArea = await app.inject({
      method: 'DELETE',
      url: `/floor/dine-areas/${areaId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(deleteArea.statusCode).toBe(204);

    const finalList = await app.inject({
      method: 'GET',
      url: '/floor/dine-areas',
      headers: { cookie },
    });
    expect((finalList.json() as { dineAreas: unknown[] }).dineAreas).toHaveLength(0);
  });

  it('rejects deleting a table that has order history, even once the order is closed', async () => {
    await app.inject({
      method: 'POST',
      url: '/branches/select',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { branchId: branchA.branchId },
    });

    const createArea = await app.inject({
      method: 'POST',
      url: '/floor/dine-areas',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { name: '__floor_test_area_orders__' },
    });
    const areaId = (createArea.json() as { dineArea: { id: number } }).dineArea.id;
    const createTable = await app.inject({
      method: 'POST',
      url: '/floor/tables',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { dineAreaId: areaId, name: '__floor_test_table_orders__', seats: 2 },
    });
    const tableId = (createTable.json() as { table: { id: number } }).table.id;

    const openOrder = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { dineTableId: tableId },
    });
    const orderId = (openOrder.json() as { order: { id: number } }).order.id;
    await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/close`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });

    const deleteTable = await app.inject({
      method: 'DELETE',
      url: `/floor/tables/${tableId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(deleteTable.statusCode).toBe(409);
    expect((deleteTable.json() as { error: string }).error).toBe('table_has_orders');
  });
});
