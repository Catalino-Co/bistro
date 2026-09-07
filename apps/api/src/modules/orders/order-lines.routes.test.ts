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
import { findTaxRateIdByName } from '../catalog/catalog.test-helpers.repo.js';
import { createDineArea, createDineTable } from '../floor/floor.repo.js';
import {
  createItemFixture,
  createModifierFixture,
  deleteOrdersTestData,
} from './orders.test-helpers.repo.js';

const USERNAME = '__order_lines_test_user__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';

describe('order lines routes', () => {
  const app = buildApp();
  let branch: BranchFixture;
  let cookie: string;
  let csrfToken: string;
  let itemId: number;
  let unrelatedItemId: number;
  let modifierId: number;
  let orderId: number;

  beforeAll(async () => {
    const userId = await createTestUser(USERNAME, PASSWORD);
    branch = await createBranchFixture('order-lines');
    await assignRole(userId, 'admin', branch.branchId);

    const taxRateId = await findTaxRateIdByName('ITBIS 18%');
    itemId = (await createItemFixture('main', taxRateId)).itemId;
    unrelatedItemId = (await createItemFixture('unrelated', taxRateId)).itemId;
    modifierId = (await createModifierFixture('extra', itemId, '25.0000')).modifierId;

    const dineAreaId = (await createDineArea(branch.branchId, '__order_lines_test_area__')).id;
    const table = await createDineTable(dineAreaId, '__order_lines_test_table__', 4);

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

    const openOrder = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { dineTableId: table.id },
    });
    orderId = (openOrder.json() as { order: { id: number } }).order.id;
  });

  afterAll(async () => {
    await deleteBranchFixture(branch);
    await deleteOrdersTestData();
    await deleteTestUser(USERNAME);
    await app.close();
    await closeTestDbPool();
  });

  it('adds two lines of the same item with different notes and a modifier', async () => {
    const firstLine = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId, quantity: 2, note: 'sin cebolla', modifierIds: [modifierId] },
    });
    expect(firstLine.statusCode).toBe(201);
    const firstBody = firstLine.json() as {
      line: { note: string | null; unitPrice: string; modifiers: { modifierId: number }[] };
    };
    expect(firstBody.line.note).toBe('sin cebolla');
    expect(firstBody.line.unitPrice).toBe('10.0000');
    expect(firstBody.line.modifiers).toEqual([
      { modifierId, name: '__orders_test_mod_extra__', priceDelta: '25.0000' },
    ]);

    const secondLine = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId, quantity: 1, note: 'bien cocido' },
    });
    expect(secondLine.statusCode).toBe(201);
    expect((secondLine.json() as { line: { note: string | null } }).line.note).toBe('bien cocido');

    const list = await app.inject({
      method: 'GET',
      url: `/orders/${orderId}/lines`,
      headers: { cookie },
    });
    const notes = (list.json() as { lines: { note: string | null }[] }).lines.map((l) => l.note);
    expect(notes.sort()).toEqual(['bien cocido', 'sin cebolla']);
  });

  it('rejects a modifier not associated with the item', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId: unrelatedItemId, quantity: 1, modifierIds: [modifierId] },
    });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toBe('modifier_not_allowed');
  });

  it('rejects adding a line to a closed order', async () => {
    const closeResponse = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/close`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(closeResponse.statusCode).toBe(204);

    const response = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId, quantity: 1 },
    });
    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: string }).error).toBe('order_closed');
  });
});
