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
import {
  deleteCustomerFixture,
  findCustomerTypeIdByName,
} from '../orders/orders.test-helpers.repo.js';

const USERNAME = '__customers_test_user__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';

describe('customers routes', () => {
  const app = buildApp();
  let branch: BranchFixture;
  let cookie: string;
  let csrfToken: string;
  let guestTypeId: number;
  const createdCustomerIds: number[] = [];

  beforeAll(async () => {
    const userId = await createTestUser(USERNAME, PASSWORD);
    branch = await createBranchFixture('customers');
    await assignRole(userId, 'admin', branch.branchId);
    guestTypeId = await findCustomerTypeIdByName('Hotel Guest');

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
    for (const id of createdCustomerIds) {
      await deleteCustomerFixture(id);
    }
    await deleteBranchFixture(branch);
    await deleteTestUser(USERNAME);
    await app.close();
    await closeTestDbPool();
  });

  it('lists the seeded customer types, including which allow room service', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/customer-types',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const types = (
      response.json() as { customerTypes: { name: string; allowsRoomService: boolean }[] }
    ).customerTypes;
    expect(types).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Hotel Guest', allowsRoomService: true }),
        expect.objectContaining({ name: 'External', allowsRoomService: false }),
      ]),
    );
  });

  it('quick-adds a customer and finds it by search', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { customerTypeId: guestTypeId, name: '__customers_test_guest__' },
    });
    expect(created.statusCode).toBe(201);
    const customer = (
      created.json() as {
        customer: { id: number; name: string; customerTypeName: string; allowsRoomService: boolean };
      }
    ).customer;
    expect(customer).toMatchObject({
      name: '__customers_test_guest__',
      customerTypeName: 'Hotel Guest',
      allowsRoomService: true,
    });
    createdCustomerIds.push(customer.id);

    const found = await app.inject({
      method: 'GET',
      url: '/customers?search=__customers_test_guest__',
      headers: { cookie },
    });
    const names = (found.json() as { customers: { name: string }[] }).customers.map((c) => c.name);
    expect(names).toEqual(['__customers_test_guest__']);

    const notFound = await app.inject({
      method: 'GET',
      url: '/customers?search=__nonexistent_customer_search__',
      headers: { cookie },
    });
    expect((notFound.json() as { customers: unknown[] }).customers).toEqual([]);
  });

  it('rejects a customer type that does not exist', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { customerTypeId: 999999999, name: '__customers_test_bad__' },
    });
    expect(response.statusCode).toBe(404);
    expect((response.json() as { error: string }).error).toBe('customer_type_not_found');
  });
});
