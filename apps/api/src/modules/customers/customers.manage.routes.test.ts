import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { cookieValue, findCookiePair, mergeCookies } from '../../test-support/http.js';
import { findAuditEvents } from '../audit/audit.repo.js';
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
import { deleteCustomerFixtures } from './customers.test-helpers.repo.js';

const USERNAME = '__customers_manage_test_user__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';

interface Customer {
  id: number;
  name: string;
  customerTypeId: number;
  customerTypeName: string;
  phone: string | null;
  taxId: string | null;
  archivedAt: string | null;
}
interface Summary {
  orderCount: number;
  totalSpent: string;
  lastOrderAt: string | null;
}

describe('managing customers', () => {
  const app = buildApp();
  let branch: BranchFixture;
  let cookie: string;
  let csrfToken: string;
  let userId: number;
  let item: CatalogItemFixture;
  let tableId: number;
  let cashMethodId: number;
  let guestTypeId = 0;
  let corporateTypeId = 0;
  let customerId = 0;
  const createdIds: number[] = [];

  async function listCustomers(query = ''): Promise<Customer[]> {
    const response = await app.inject({
      method: 'GET',
      url: `/customers${query}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    return (response.json() as { customers: Customer[] }).customers;
  }

  async function detail(id = customerId) {
    const response = await app.inject({
      method: 'GET',
      url: `/customers/${id}`,
      headers: { cookie },
    });
    return {
      status: response.statusCode,
      ...(response.json() as { customer: Customer; summary: Summary }),
    };
  }

  beforeAll(async () => {
    userId = await createTestUser(USERNAME, PASSWORD);
    branch = await createBranchFixture('customers-manage');
    await assignRole(userId, 'admin', branch.branchId);

    cashMethodId = await findPaymentMethodIdByName('Efectivo');
    item = await createCatalogItem('customers', await findTaxRateIdByName('ITBIS 18%'));
    const area = await createDineArea(branch.branchId, '__customers_manage_test_area__');
    tableId = (await createDineTable(area.id, '__customers_manage_test_table__', 4)).id;

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

    const types = (
      await app.inject({ method: 'GET', url: '/customer-types', headers: { cookie } })
    ).json() as { customerTypes: { id: number; name: string; allowsRoomService: boolean }[] };
    guestTypeId = types.customerTypes.find((t) => t.allowsRoomService)!.id;
    corporateTypeId = types.customerTypes.find((t) => !t.allowsRoomService)!.id;
  });

  afterAll(async () => {
    await deleteBranchFixture(branch);
    await deleteCustomerFixtures(createdIds);
    await deleteCatalogFixtures([item]);
    await deleteTestUser(USERNAME);
    await app.close();
    await closeTestDbPool();
  });

  it('creates a customer with its phone and RNC', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: {
        customerTypeId: guestTypeId,
        name: '__customers_manage_test_guest__',
        phone: '809-555-0101',
        taxId: '131-99999-9',
      },
    });
    expect(response.statusCode).toBe(201);
    const { customer } = response.json() as { customer: Customer };
    customerId = customer.id;
    createdIds.push(customerId);
    expect(customer).toMatchObject({ phone: '809-555-0101', taxId: '131-99999-9' });
  });

  it('edits the customer, and clears a field when sent as null', async () => {
    const renamed = await app.inject({
      method: 'PATCH',
      url: `/customers/${customerId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { name: '__customers_manage_test_renamed__', customerTypeId: corporateTypeId },
    });
    expect(renamed.statusCode).toBe(200);
    expect((renamed.json() as { customer: Customer }).customer).toMatchObject({
      name: '__customers_manage_test_renamed__',
      customerTypeId: corporateTypeId,
      // Lo que no viene en el patch no se toca.
      phone: '809-555-0101',
    });

    const cleared = await app.inject({
      method: 'PATCH',
      url: `/customers/${customerId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { phone: null },
    });
    expect((cleared.json() as { customer: Customer }).customer.phone).toBeNull();

    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/customers/${customerId}`,
          headers: { cookie, 'x-csrf-token': csrfToken },
          payload: {},
        })
      ).statusCode,
    ).toBe(400);

    const badType = await app.inject({
      method: 'PATCH',
      url: `/customers/${customerId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { customerTypeId: 99_999_999 },
    });
    expect(badType.statusCode).toBe(400);
    expect((badType.json() as { error: string }).error).toBe('customer_type_not_found');
  });

  it('adds up what the customer has actually been charged', async () => {
    const empty = await detail();
    expect(empty.summary).toMatchObject({ orderCount: 0, totalSpent: '0.0000' });
    expect(empty.summary.lastOrderAt).toBeNull();

    // Dos órdenes cobradas: 2 x 10.00 -> 23.60, y 1 x 10.00 -> 11.80
    for (const [quantity, amount] of [
      [2, '23.60'],
      [1, '11.80'],
    ] as const) {
      const opened = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: { cookie, 'x-csrf-token': csrfToken },
        payload: { dineTableId: tableId, dispatchMode: 'dine_in', customerId },
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
        payload: { paymentMethodId: cashMethodId, amount },
      });
      await app.inject({
        method: 'POST',
        url: `/orders/${orderId}/close`,
        headers: { cookie, 'x-csrf-token': csrfToken },
      });
    }

    const summary = (await detail()).summary;
    expect(summary).toMatchObject({ orderCount: 2, totalSpent: '35.4000' });
    expect(summary.lastOrderAt).not.toBeNull();

    // Y sus órdenes se pueden listar aparte.
    const orders = await app.inject({
      method: 'GET',
      url: `/orders?customerId=${customerId}`,
      headers: { cookie },
    });
    expect((orders.json() as { orders: unknown[] }).orders).toHaveLength(2);
  });

  it('archives the customer out of the picker without touching its orders', async () => {
    const archived = await app.inject({
      method: 'POST',
      url: `/customers/${customerId}/archive`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(archived.statusCode).toBe(200);

    // Fuera del buscador del POS...
    expect(
      (await listCustomers('?search=__customers_manage_test_')).map((c) => c.id),
    ).not.toContain(customerId);
    // ...pero presente bajo el filtro de archivados.
    const inArchive = await listCustomers('?status=archived&search=__customers_manage_test_');
    expect(inArchive.map((c) => c.id)).toContain(customerId);

    // Y su historial no se movió: es la garantía de archivar en vez de borrar.
    const after = await detail();
    expect(after.summary).toMatchObject({ orderCount: 2, totalSpent: '35.4000' });

    const blocked = await app.inject({
      method: 'PATCH',
      url: `/customers/${customerId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { name: 'no debería pasar' },
    });
    expect(blocked.statusCode).toBe(409);
    expect((blocked.json() as { error: string }).error).toBe('customer_archived');

    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/customers/${customerId}/archive`,
          headers: { cookie, 'x-csrf-token': csrfToken },
        })
      ).statusCode,
    ).toBe(409);
  });

  it('restores the customer back into the picker', async () => {
    const restored = await app.inject({
      method: 'POST',
      url: `/customers/${customerId}/restore`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(restored.statusCode).toBe(200);
    expect((restored.json() as { customer: Customer }).customer.archivedAt).toBeNull();

    expect((await listCustomers('?search=__customers_manage_test_')).map((c) => c.id)).toContain(
      customerId,
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/customers/${customerId}/restore`,
          headers: { cookie, 'x-csrf-token': csrfToken },
        })
      ).statusCode,
    ).toBe(409);
  });

  it('leaves every change in the audit trail', async () => {
    for (const key of ['customers.updated', 'customers.archived', 'customers.restored']) {
      const events = await findAuditEvents(key, String(customerId));
      expect(events.length).toBeGreaterThan(0);
      expect(events[0]).toMatchObject({ entityType: 'customer', userId });
    }
  });

  it('404s for a customer that does not exist', async () => {
    expect((await detail(99_999_999)).status).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/customers/99999999/archive',
          headers: { cookie, 'x-csrf-token': csrfToken },
        })
      ).statusCode,
    ).toBe(404);
  });
});
