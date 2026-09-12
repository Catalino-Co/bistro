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
import { createKitchenStation } from '../catalog/catalog.repo.js';
import { deleteKitchenStation, findTaxRateIdByName } from '../catalog/catalog.test-helpers.repo.js';
import { createDineArea, createDineTable } from '../floor/floor.repo.js';
import {
  createCatalogItem,
  deleteCatalogFixtures,
  type CatalogItemFixture,
} from '../orders/orders.totals.test-helpers.repo.js';

const USERNAME = '__kitchen_test_user__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';

describe('kitchen station tickets', () => {
  const app = buildApp();
  let branch: BranchFixture;
  let cookie: string;
  let csrfToken: string;
  let stationId: number;
  let item: CatalogItemFixture;
  let orderId: number;

  beforeAll(async () => {
    const userId = await createTestUser(USERNAME, PASSWORD);
    branch = await createBranchFixture('kitchen');
    await assignRole(userId, 'admin', branch.branchId);

    stationId = (await createKitchenStation('__kitchen_test_station__')).id;
    const taxRateId = await findTaxRateIdByName('ITBIS 18%');
    item = await createCatalogItem('kitchen', taxRateId);

    const dineAreaId = (await createDineArea(branch.branchId, '__kitchen_test_area__')).id;
    const table = await createDineTable(dineAreaId, '__kitchen_test_table__', 4);

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

    await app.inject({
      method: 'PATCH',
      url: `/catalog/items/${item.itemId}/station`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { stationId },
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
    await deleteCatalogFixtures([item]);
    await deleteKitchenStation(stationId);
    await deleteTestUser(USERNAME);
    await app.close();
    await closeTestDbPool();
  });

  it('is empty before any line is sent, then shows a sent line, then clears it once prepared', async () => {
    const emptyBefore = await app.inject({
      method: 'GET',
      url: `/kitchen/stations/${stationId}/tickets`,
      headers: { cookie },
    });
    expect(emptyBefore.statusCode).toBe(200);
    expect((emptyBefore.json() as { lines: unknown[] }).lines).toEqual([]);

    const addLine = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId: item.itemId, quantity: 2, note: 'bien cocido' },
    });
    const lineId = (addLine.json() as { line: { id: number } }).line.id;

    const stillEmpty = await app.inject({
      method: 'GET',
      url: `/kitchen/stations/${stationId}/tickets`,
      headers: { cookie },
    });
    expect((stillEmpty.json() as { lines: unknown[] }).lines).toEqual([]);

    await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/send-to-kitchen`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });

    const tickets = await app.inject({
      method: 'GET',
      url: `/kitchen/stations/${stationId}/tickets`,
      headers: { cookie },
    });
    const lines = (
      tickets.json() as {
        lines: { id: number; itemName: string; quantity: number; note: string | null }[];
      }
    ).lines;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ id: lineId, quantity: 2, note: 'bien cocido' });

    const prepared = await app.inject({
      method: 'POST',
      url: `/kitchen/lines/${lineId}/prepared`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(prepared.statusCode).toBe(204);

    const afterPrepared = await app.inject({
      method: 'GET',
      url: `/kitchen/stations/${stationId}/tickets`,
      headers: { cookie },
    });
    expect((afterPrepared.json() as { lines: unknown[] }).lines).toEqual([]);
  });

  it('rejects marking prepared twice, marking an unsent line, and an unknown line', async () => {
    const addLine = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId: item.itemId, quantity: 1 },
    });
    const unsentLineId = (addLine.json() as { line: { id: number } }).line.id;

    const notSent = await app.inject({
      method: 'POST',
      url: `/kitchen/lines/${unsentLineId}/prepared`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(notSent.statusCode).toBe(409);
    expect((notSent.json() as { error: string }).error).toBe('not_sent');

    await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/send-to-kitchen`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    const firstPrepare = await app.inject({
      method: 'POST',
      url: `/kitchen/lines/${unsentLineId}/prepared`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(firstPrepare.statusCode).toBe(204);

    const secondPrepare = await app.inject({
      method: 'POST',
      url: `/kitchen/lines/${unsentLineId}/prepared`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(secondPrepare.statusCode).toBe(409);
    expect((secondPrepare.json() as { error: string }).error).toBe('already_prepared');

    const unknown = await app.inject({
      method: 'POST',
      url: '/kitchen/lines/999999999/prepared',
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(unknown.statusCode).toBe(404);
    expect((unknown.json() as { error: string }).error).toBe('line_not_found');
  });
});
