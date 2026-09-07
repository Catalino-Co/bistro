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
import {
  createCustomerFixture,
  deleteCustomerFixture,
  findCustomerTypeIdByName,
} from './orders.test-helpers.repo.js';

const USERNAME = '__dispatch_mode_test_user__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';

describe('order dispatch modes', () => {
  const app = buildApp();
  let branch: BranchFixture;
  let dineAreaId: number;
  let guestCustomerId: number;
  let externalCustomerId: number;
  let cookie: string;
  let csrfToken: string;

  beforeAll(async () => {
    const userId = await createTestUser(USERNAME, PASSWORD);
    branch = await createBranchFixture('dispatch-mode');
    await assignRole(userId, 'admin', branch.branchId);
    dineAreaId = (await createDineArea(branch.branchId, '__dispatch_mode_test_area__')).id;

    const guestTypeId = await findCustomerTypeIdByName('Hotel Guest');
    const externalTypeId = await findCustomerTypeIdByName('External');
    guestCustomerId = await createCustomerFixture('guest', guestTypeId);
    externalCustomerId = await createCustomerFixture('external', externalTypeId);

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
    // ID-scoped, not the shared wildcard deleteOrdersTestData() --
    // order-lines.routes.test.ts runs concurrently and owns that sweep for
    // its own item/modifier fixtures under the same name prefix.
    await deleteCustomerFixture(guestCustomerId);
    await deleteCustomerFixture(externalCustomerId);
    await deleteTestUser(USERNAME);
    await app.close();
    await closeTestDbPool();
  });

  it('rejects room_service for a customer whose type does not allow it', async () => {
    const table = await createDineTable(dineAreaId, '__dispatch_mode_test_table_1__', 2);
    const response = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: {
        dineTableId: table.id,
        dispatchMode: 'room_service',
        customerId: externalCustomerId,
      },
    });
    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: string }).error).toBe('room_service_not_allowed');
  });

  it('rejects room_service with no customer at all', async () => {
    const table = await createDineTable(dineAreaId, '__dispatch_mode_test_table_2__', 2);
    const response = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { dineTableId: table.id, dispatchMode: 'room_service' },
    });
    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: string }).error).toBe('room_service_not_allowed');
  });

  it('accepts room_service for a hotel guest customer', async () => {
    const table = await createDineTable(dineAreaId, '__dispatch_mode_test_table_3__', 2);
    const response = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { dineTableId: table.id, dispatchMode: 'room_service', customerId: guestCustomerId },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as { order: { dispatchMode: string; customerId: number } };
    expect(body.order.dispatchMode).toBe('room_service');
    expect(body.order.customerId).toBe(guestCustomerId);
  });

  it('defaults to dine_in when dispatchMode is omitted', async () => {
    const table = await createDineTable(dineAreaId, '__dispatch_mode_test_table_4__', 2);
    const response = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { dineTableId: table.id },
    });
    expect(response.statusCode).toBe(201);
    expect((response.json() as { order: { dispatchMode: string } }).order.dispatchMode).toBe(
      'dine_in',
    );
  });
});
