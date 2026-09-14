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
} from '../orders/orders.totals.test-helpers.repo.js';

const USERNAME = '__reports_test_user__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';

interface DailySummary {
  sales: {
    orderCount: number;
    subtotal: string;
    taxTotal: string;
    total: string;
    averageTicket: string;
  };
  openNow: { orderCount: number; total: string };
  tipTotal: string;
  payments: { paymentMethodName: string; count: number; amount: string; tipAmount: string }[];
  byFamily: { name: string; quantity: number; amount: string }[];
  byStation: { name: string; quantity: number; amount: string }[];
  byHour: { hour: number; orderCount: number; amount: string }[];
}

describe('daily report', () => {
  const app = buildApp();
  let branch: BranchFixture;
  let cookie: string;
  let csrfToken: string;
  let item: CatalogItemFixture;
  let tableA: number;
  let tableB: number;
  let cashMethodId: number;

  async function daily(): Promise<DailySummary> {
    const from = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    const response = await app.inject({
      method: 'GET',
      url: `/reports/daily?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    return response.json() as DailySummary;
  }

  async function sellAndClose(tableId: number, quantity: number, amount: string, tip: string) {
    const opened = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { dineTableId: tableId },
    });
    const orderId = (opened.json() as { order: { id: number } }).order.id;
    await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId: item.itemId, quantity },
    });
    await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/payments`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { paymentMethodId: cashMethodId, amount, tipAmount: tip },
    });
    const closed = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/close`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(closed.statusCode).toBe(204);
    return orderId;
  }

  beforeAll(async () => {
    const userId = await createTestUser(USERNAME, PASSWORD);
    branch = await createBranchFixture('reports');
    await assignRole(userId, 'admin', branch.branchId);

    cashMethodId = await findPaymentMethodIdByName('Efectivo');
    item = await createCatalogItem('reports', await findTaxRateIdByName('ITBIS 18%'));

    const area = await createDineArea(branch.branchId, '__reports_test_area__');
    tableA = (await createDineTable(area.id, '__reports_test_table_a__', 4)).id;
    tableB = (await createDineTable(area.id, '__reports_test_table_b__', 2)).id;

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
    await deleteBranchFixture(branch);
    await deleteCatalogFixtures([item]);
    await deleteTestUser(USERNAME);
    await app.close();
    await closeTestDbPool();
  });

  it('reports zeros for a branch that has not sold anything', async () => {
    const summary = await daily();
    expect(summary.sales).toMatchObject({
      orderCount: 0,
      total: '0.0000',
      averageTicket: '0.0000',
    });
    expect(summary.byFamily).toEqual([]);
    expect(summary.payments).toEqual([]);
  });

  it('adds up the day: total, average ticket, tips and payment methods', async () => {
    // 2 x 10.00 -> 20.00 + 3.60 = 23.60, con 5.00 de propina
    await sellAndClose(tableA, 2, '23.60', '5.00');
    // 4 x 10.00 -> 40.00 + 7.20 = 47.20, sin propina
    await sellAndClose(tableB, 4, '47.20', '0');

    const summary = await daily();
    expect(summary.sales).toMatchObject({
      orderCount: 2,
      subtotal: '60.0000',
      taxTotal: '10.8000',
      total: '70.8000',
      // 70.80 / 2
      averageTicket: '35.4000',
    });
    expect(summary.tipTotal).toBe('5.0000');
    expect(summary.payments).toHaveLength(1);
    expect(summary.payments[0]).toMatchObject({
      paymentMethodName: 'Efectivo',
      count: 2,
      amount: '70.8000',
      tipAmount: '5.0000',
    });
  });

  it('breaks the day down by family and by station, on line subtotals without tax', async () => {
    const summary = await daily();
    expect(summary.byFamily).toHaveLength(1);
    expect(summary.byFamily[0]).toMatchObject({
      name: '__order_totals_test_cat_reports__',
      quantity: 6,
      amount: '60.0000',
    });
    // El ítem de prueba no tiene estación asignada.
    expect(summary.byStation).toEqual([
      { id: null, name: 'Sin estación', quantity: 6, amount: '60.0000' },
    ]);

    const soldHours = summary.byHour.reduce((sum, slice) => sum + slice.orderCount, 0);
    expect(soldHours).toBe(2);
  });

  it('counts what is still on the tables apart from what was sold', async () => {
    const opened = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { dineTableId: tableA },
    });
    const orderId = (opened.json() as { order: { id: number } }).order.id;
    await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId: item.itemId, quantity: 1 },
    });

    const summary = await daily();
    // Lo abierto no se cuenta como venta...
    expect(summary.sales.orderCount).toBe(2);
    expect(summary.sales.total).toBe('70.8000');
    // ...pero sí se reporta aparte.
    expect(summary.openNow).toEqual({ orderCount: 1, total: '11.8000' });
  });

  it('requires a selected branch', async () => {
    const primed = await app.inject({ method: 'GET', url: '/health' });
    const csrfCookie = findCookiePair(primed.headers['set-cookie'], 'csrf');
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: {
        cookie: mergeCookies(findCookiePair(primed.headers['set-cookie'], 'sessionId'), csrfCookie),
        'x-csrf-token': cookieValue(csrfCookie),
      },
      payload: { username: USERNAME, password: PASSWORD },
    });
    const freshCookie = mergeCookies(
      findCookiePair(login.headers['set-cookie'], 'sessionId'),
      csrfCookie,
    );

    const response = await app.inject({
      method: 'GET',
      url: `/reports/daily?from=${encodeURIComponent(new Date().toISOString())}&to=${encodeURIComponent(new Date().toISOString())}`,
      headers: { cookie: freshCookie },
    });
    expect(response.statusCode).toBe(409);
  });
});
