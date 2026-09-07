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
import { deleteCatalogTestData, findTaxRateIdByName } from './catalog.test-helpers.repo.js';

const USERNAME = '__catalog_test_user__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';

describe('catalog routes', () => {
  const app = buildApp();
  let branch: BranchFixture;
  let cookie: string;
  let csrfToken: string;

  beforeAll(async () => {
    const userId = await createTestUser(USERNAME, PASSWORD);
    branch = await createBranchFixture('catalog');
    await assignRole(userId, 'admin', branch.branchId);

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
    await deleteCatalogTestData();
    await deleteBranchFixture(branch);
    await deleteTestUser(USERNAME);
    await app.close();
    await closeTestDbPool();
  });

  it('creates the full category -> family -> subfamily -> item chain', async () => {
    const category = await app.inject({
      method: 'POST',
      url: '/catalog/categories',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { name: '__catalog_test_category__' },
    });
    expect(category.statusCode).toBe(201);
    const categoryId = (category.json() as { category: { id: number } }).category.id;

    const family = await app.inject({
      method: 'POST',
      url: '/catalog/families',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { categoryId, name: '__catalog_test_family__' },
    });
    expect(family.statusCode).toBe(201);
    const familyId = (family.json() as { family: { id: number } }).family.id;

    // The literal point of this task: creating a subfamily is exactly as
    // available as every other level, with no code change involved.
    const subfamily = await app.inject({
      method: 'POST',
      url: '/catalog/subfamilies',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { familyId, name: '__catalog_test_subfamily__' },
    });
    expect(subfamily.statusCode).toBe(201);
    const subfamilyId = (subfamily.json() as { subfamily: { id: number } }).subfamily.id;

    const subfamiliesForFamily = await app.inject({
      method: 'GET',
      url: `/catalog/subfamilies?familyId=${familyId}`,
      headers: { cookie },
    });
    const subfamilyNames = (
      subfamiliesForFamily.json() as { subfamilies: { name: string }[] }
    ).subfamilies.map((s) => s.name);
    expect(subfamilyNames).toEqual(['__catalog_test_subfamily__']);

    const taxRateId = await findTaxRateIdByName('ITBIS 18%');
    const item = await app.inject({
      method: 'POST',
      url: '/catalog/items',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { subfamilyId, name: '__catalog_test_item__', price: '250.00', taxRateId },
    });
    expect(item.statusCode).toBe(201);

    const itemsForSubfamily = await app.inject({
      method: 'GET',
      url: `/catalog/items?subfamilyId=${subfamilyId}`,
      headers: { cookie },
    });
    const itemNames = (itemsForSubfamily.json() as { items: { name: string }[] }).items.map(
      (i) => i.name,
    );
    expect(itemNames).toEqual(['__catalog_test_item__']);
  });
});
