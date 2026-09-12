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
  createModifier,
  deleteCatalogFixtures,
  type CatalogItemFixture,
  type ModifierFixture,
} from './orders.totals.test-helpers.repo.js';

const USERNAME = '__order_totals_test_user__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';

interface Totals {
  subtotal: string;
  taxTotal: string;
  total: string;
}

describe('order totals', () => {
  const app = buildApp();
  let branch: BranchFixture;
  let cookie: string;
  let csrfToken: string;
  let taxedItem: CatalogItemFixture;
  let exemptItem: CatalogItemFixture;
  let modifier: ModifierFixture;
  let taxedItemId: number;
  let exemptItemId: number;
  let modifierId: number;
  let orderId: number;
  let cashMethodId: number;

  beforeAll(async () => {
    const userId = await createTestUser(USERNAME, PASSWORD);
    branch = await createBranchFixture('order-totals');
    await assignRole(userId, 'admin', branch.branchId);

    cashMethodId = await findPaymentMethodIdByName('Efectivo');
    const taxedRateId = await findTaxRateIdByName('ITBIS 18%');
    const exemptRateId = await findTaxRateIdByName('Exento 0%');
    taxedItem = await createCatalogItem('taxed', taxedRateId);
    exemptItem = await createCatalogItem('exempt', exemptRateId);
    modifier = await createModifier('extra', taxedItem.itemId, '5.0000');
    taxedItemId = taxedItem.itemId;
    exemptItemId = exemptItem.itemId;
    modifierId = modifier.modifierId;

    const dineAreaId = (await createDineArea(branch.branchId, '__order_totals_test_area__')).id;
    const table = await createDineTable(dineAreaId, '__order_totals_test_table__', 4);

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
    await deleteCatalogFixtures([taxedItem, exemptItem], modifier);
    await deleteTestUser(USERNAME);
    await app.close();
    await closeTestDbPool();
  });

  async function getTotals(): Promise<Totals> {
    const response = await app.inject({
      method: 'GET',
      url: `/orders/${orderId}/totals`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    return response.json() as Totals;
  }

  it('is all zeros for an order with no lines yet', async () => {
    expect(await getTotals()).toEqual({
      subtotal: '0.0000',
      taxTotal: '0.0000',
      total: '0.0000',
    });
  });

  it('applies each line’s own item tax rate, live, while the order is open', async () => {
    await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId: taxedItemId, quantity: 2, modifierIds: [modifierId] },
    });
    // Item fixture price is a fixed 10.0000: (10 + 5 modifier) * 2 = 30
    // subtotal, 18% tax = 5.4, total 35.4.
    expect(await getTotals()).toEqual({
      subtotal: '30.0000',
      taxTotal: '5.4000',
      total: '35.4000',
    });

    const exemptLine = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId: exemptItemId, quantity: 1 },
    });
    const exemptLineId = (exemptLine.json() as { line: { id: number } }).line.id;
    // + 10 exempt (0% tax): subtotal 40, tax still 5.4, total 45.4.
    expect(await getTotals()).toEqual({
      subtotal: '40.0000',
      taxTotal: '5.4000',
      total: '45.4000',
    });

    await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines/${exemptLineId}/void`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    // Voiding the exempt line drops totals back to just the taxed line.
    expect(await getTotals()).toEqual({
      subtotal: '30.0000',
      taxTotal: '5.4000',
      total: '35.4000',
    });
  });

  it('freezes the last live totals once the order is closed', async () => {
    const beforeClose = await getTotals();

    await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/payments`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { paymentMethodId: cashMethodId, amount: beforeClose.total },
    });

    const close = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/close`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(close.statusCode).toBe(204);

    expect(await getTotals()).toEqual(beforeClose);
  });

  it('returns order_not_found for an order id that does not exist', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/orders/999999999/totals',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(404);
    expect((response.json() as { error: string }).error).toBe('order_not_found');
  });
});
