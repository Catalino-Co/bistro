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
  createCatalogItem,
  deleteCatalogFixtures,
  type CatalogItemFixture,
} from '../orders/orders.totals.test-helpers.repo.js';
import { findPaymentMethodIdByName } from './payments.test-helpers.repo.js';

const USERNAME = '__payments_test_user__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';

describe('payments', () => {
  const app = buildApp();
  let branch: BranchFixture;
  let cookie: string;
  let csrfToken: string;
  let item: CatalogItemFixture;
  let cashMethodId: number;
  let cardMethodId: number;
  let dineAreaId: number;

  beforeAll(async () => {
    const userId = await createTestUser(USERNAME, PASSWORD);
    branch = await createBranchFixture('payments');
    await assignRole(userId, 'admin', branch.branchId);

    const taxRateId = await findTaxRateIdByName('ITBIS 18%');
    item = await createCatalogItem('payments', taxRateId);
    cashMethodId = await findPaymentMethodIdByName('Efectivo');
    cardMethodId = await findPaymentMethodIdByName('Tarjeta');
    dineAreaId = (await createDineArea(branch.branchId, '__payments_test_area__')).id;

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

  async function openOrderOnFreshTable(suffix: string): Promise<number> {
    const table = await createDineTable(dineAreaId, `__payments_test_table_${suffix}__`, 2);
    const open = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { dineTableId: table.id },
    });
    return (open.json() as { order: { id: number } }).order.id;
  }

  async function addLine(orderId: number, quantity: number) {
    await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId: item.itemId, quantity },
    });
  }

  it('lists the seeded payment methods', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/payment-methods',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const names = (response.json() as { paymentMethods: { name: string }[] }).paymentMethods.map(
      (m) => m.name,
    );
    expect(names).toEqual(expect.arrayContaining(['Efectivo', 'Tarjeta']));
  });

  it('accepts a split payment across methods and then allows closing', async () => {
    const orderId = await openOrderOnFreshTable('split');
    await addLine(orderId, 3); // 3 * 10.0000 = 30 subtotal, 18% tax = 5.4, total 35.4

    const cash = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/payments`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { paymentMethodId: cashMethodId, amount: '20.0000', tenderedAmount: '20.0000' },
    });
    expect(cash.statusCode).toBe(201);
    const cashBody = cash.json() as { payment: { paymentMethodName: string; amount: string } };
    expect(cashBody.payment.paymentMethodName).toBe('Efectivo');
    expect(cashBody.payment.amount).toBe('20.0000');

    const card = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/payments`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { paymentMethodId: cardMethodId, amount: '15.4000', tipAmount: '5.0000' },
    });
    expect(card.statusCode).toBe(201);

    const list = await app.inject({
      method: 'GET',
      url: `/orders/${orderId}/payments`,
      headers: { cookie },
    });
    const payments = (list.json() as { payments: { paymentMethodName: string }[] }).payments;
    expect(payments.map((p) => p.paymentMethodName).sort()).toEqual(['Efectivo', 'Tarjeta']);

    const close = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/close`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(close.statusCode).toBe(204);
  });

  it('rejects closing an order whose payments do not yet cover the total', async () => {
    const orderId = await openOrderOnFreshTable('unpaid');
    await addLine(orderId, 1); // 10 subtotal, 1.8 tax, total 11.8

    const close = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/close`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(close.statusCode).toBe(409);
    const body = close.json() as { error: string; balanceDue: string };
    expect(body.error).toBe('insufficient_payment');
    expect(body.balanceDue).toBe('11.8000');
  });

  it('rejects a payment whose amount exceeds the remaining balance', async () => {
    const orderId = await openOrderOnFreshTable('overpay');
    await addLine(orderId, 1); // total 11.8

    const response = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/payments`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { paymentMethodId: cashMethodId, amount: '100.0000' },
    });
    expect(response.statusCode).toBe(409);
    const body = response.json() as { error: string; balanceDue: string };
    expect(body.error).toBe('amount_exceeds_balance');
    expect(body.balanceDue).toBe('11.8000');
  });

  it('rejects a cash payment tendered for less than its own amount', async () => {
    const orderId = await openOrderOnFreshTable('tendered-low');
    await addLine(orderId, 1);

    const response = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/payments`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { paymentMethodId: cashMethodId, amount: '10.0000', tenderedAmount: '5.0000' },
    });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toBe('tendered_amount_too_low');
  });

  it('rejects a payment for a payment method that does not exist', async () => {
    const orderId = await openOrderOnFreshTable('bad-method');
    await addLine(orderId, 1);

    const response = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/payments`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { paymentMethodId: 999999999, amount: '1.0000' },
    });
    expect(response.statusCode).toBe(404);
    expect((response.json() as { error: string }).error).toBe('payment_method_not_found');
  });

  it('rejects a payment for an order that does not exist', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/orders/999999999/payments',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { paymentMethodId: cashMethodId, amount: '1.0000' },
    });
    expect(response.statusCode).toBe(404);
    expect((response.json() as { error: string }).error).toBe('order_not_found');
  });

  it('rejects a payment for an order that is already closed', async () => {
    const orderId = await openOrderOnFreshTable('already-closed');
    // No lines added: total is 0, so this closes with no payment needed.
    const close = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/close`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(close.statusCode).toBe(204);

    const response = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/payments`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { paymentMethodId: cashMethodId, amount: '1.0000' },
    });
    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: string }).error).toBe('order_closed');
  });
});
