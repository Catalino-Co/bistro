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
import { findPaymentMethodIdByName } from '../payments/payments.test-helpers.repo.js';
import {
  createCatalogItem,
  deleteCatalogFixtures,
  type CatalogItemFixture,
} from './orders.totals.test-helpers.repo.js';

const USERNAME = '__orders_history_test_user__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';

interface HistoryRow {
  id: number;
  status: string;
  dineTableName: string;
  areaName: string;
  openedAt: string;
  closedAt: string | null;
  total: string;
  lineCount: number;
}

describe('orders history', () => {
  const app = buildApp();
  let branch: BranchFixture;
  let cookie: string;
  let csrfToken: string;
  let item: CatalogItemFixture;
  let tableA: number;
  let tableB: number;
  let cashMethodId: number;
  let closedOrderId = 0;
  let openOrderId = 0;

  async function history(query = ''): Promise<HistoryRow[]> {
    const response = await app.inject({
      method: 'GET',
      url: `/orders${query}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    return (response.json() as { orders: HistoryRow[] }).orders;
  }

  async function addLine(orderId: number, quantity: number) {
    await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId: item.itemId, quantity },
    });
  }

  beforeAll(async () => {
    const userId = await createTestUser(USERNAME, PASSWORD);
    branch = await createBranchFixture('orders-history');
    await assignRole(userId, 'admin', branch.branchId);

    cashMethodId = await findPaymentMethodIdByName('Efectivo');
    item = await createCatalogItem('history', await findTaxRateIdByName('ITBIS 18%'));

    const area = await createDineArea(branch.branchId, '__orders_history_test_area__');
    tableA = (await createDineTable(area.id, '__orders_history_test_table_a__', 4)).id;
    tableB = (await createDineTable(area.id, '__orders_history_test_table_b__', 2)).id;

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

    // Una orden cobrada y cerrada: 2 x 10.00 + ITBIS = 23.60
    const closed = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { dineTableId: tableA },
    });
    closedOrderId = (closed.json() as { order: { id: number } }).order.id;
    await addLine(closedOrderId, 2);
    await app.inject({
      method: 'POST',
      url: `/orders/${closedOrderId}/payments`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { paymentMethodId: cashMethodId, amount: '23.60' },
    });
    await app.inject({
      method: 'POST',
      url: `/orders/${closedOrderId}/close`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });

    // Y una que sigue abierta en otra mesa: 1 x 10.00 + ITBIS = 11.80
    const open = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { dineTableId: tableB },
    });
    openOrderId = (open.json() as { order: { id: number } }).order.id;
    await addLine(openOrderId, 1);
  });

  afterAll(async () => {
    await deleteBranchFixture(branch);
    await deleteCatalogFixtures([item]);
    await deleteTestUser(USERNAME);
    await app.close();
    await closeTestDbPool();
  });

  it('lists closed orders, which had no way of being seen before', async () => {
    const orders = await history();
    expect(orders.map((o) => o.id).sort()).toEqual([closedOrderId, openOrderId].sort());

    const closed = orders.find((o) => o.id === closedOrderId)!;
    expect(closed).toMatchObject({
      status: 'closed',
      dineTableName: '__orders_history_test_table_a__',
      areaName: '__orders_history_test_area__',
      total: '23.6000',
      lineCount: 1,
    });
    expect(closed.closedAt).not.toBeNull();
  });

  it('shows the live total for an open order and the frozen one for a closed order', async () => {
    const before = (await history('?status=open')).find((o) => o.id === openOrderId)!;
    expect(before.total).toBe('11.8000');
    expect(before.closedAt).toBeNull();

    // Al agregar otra línea el total de la abierta sube...
    await addLine(openOrderId, 1);
    const after = (await history('?status=open')).find((o) => o.id === openOrderId)!;
    expect(after.total).toBe('23.6000');
    expect(after.lineCount).toBe(2);

    // ...y el de la cerrada no se mueve: sale de la columna congelada.
    const closed = (await history('?status=closed')).find((o) => o.id === closedOrderId)!;
    expect(closed.total).toBe('23.6000');
  });

  it('filters by status, by table name and by order id', async () => {
    expect((await history('?status=closed')).map((o) => o.id)).toEqual([closedOrderId]);
    expect((await history('?status=open')).map((o) => o.id)).toEqual([openOrderId]);

    const byTable = await history('?search=__orders_history_test_table_b__');
    expect(byTable.map((o) => o.id)).toEqual([openOrderId]);

    const byId = await history(`?search=${closedOrderId}`);
    expect(byId.map((o) => o.id)).toEqual([closedOrderId]);

    // Una búsqueda que no coincide con nada devuelve una lista vacía, no todo.
    expect(await history('?search=__no_existe_esta_mesa__')).toEqual([]);
  });

  it('filters by date range on when the order was opened', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    expect(await history(`?from=${tomorrow}`)).toEqual([]);
    expect((await history(`?from=${yesterday}&to=${tomorrow}`)).length).toBe(2);
  });

  it('requires a selected branch', async () => {
    const primed = await app.inject({ method: 'GET', url: '/health' });
    const freshCsrf = findCookiePair(primed.headers['set-cookie'], 'csrf');
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: {
        cookie: mergeCookies(findCookiePair(primed.headers['set-cookie'], 'sessionId'), freshCsrf),
        'x-csrf-token': cookieValue(freshCsrf),
      },
      payload: { username: USERNAME, password: PASSWORD },
    });
    const freshCookie = mergeCookies(
      findCookiePair(login.headers['set-cookie'], 'sessionId'),
      freshCsrf,
    );

    const response = await app.inject({
      method: 'GET',
      url: '/orders',
      headers: { cookie: freshCookie },
    });
    expect(response.statusCode).toBe(409);
  });
});
