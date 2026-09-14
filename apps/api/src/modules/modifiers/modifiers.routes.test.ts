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
  createFamily,
  createSubfamily,
  createItem,
  createCategory,
} from '../catalog/catalog.repo.js';
import { findTaxRateIdByName } from '../catalog/catalog.test-helpers.repo.js';
import { deleteModifiersTestData } from './modifiers.test-helpers.repo.js';
import { calculateLineTotal } from './pricing.js';

const USERNAME = '__modifiers_test_user__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';

describe('modifiers routes', () => {
  const app = buildApp();
  let branch: BranchFixture;
  let cookie: string;
  let csrfToken: string;
  let itemId: number;

  beforeAll(async () => {
    const userId = await createTestUser(USERNAME, PASSWORD);
    branch = await createBranchFixture('modifiers');
    await assignRole(userId, 'admin', branch.branchId);

    const family = await createFamily('__modifiers_test_family__');
    const subfamily = await createSubfamily(family.id, '__modifiers_test_subfamily__');
    const category = await createCategory(subfamily.id, '__modifiers_test_category__');
    const taxRateId = await findTaxRateIdByName('ITBIS 18%');
    const item = await createItem(category.id, '__modifiers_test_item__', '100.0000', taxRateId);
    itemId = item.id;

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
    await deleteModifiersTestData();
    await deleteBranchFixture(branch);
    await deleteTestUser(USERNAME);
    await app.close();
    await closeTestDbPool();
  });

  it('creates a modifier group with a priced modifier, associates it with an item, and the price actually changes the line total', async () => {
    const group = await app.inject({
      method: 'POST',
      url: '/modifiers/groups',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { name: '__modifiers_test_group__', selectionType: 'single' },
    });
    expect(group.statusCode).toBe(201);
    const groupId = (group.json() as { group: { id: number } }).group.id;

    const modifier = await app.inject({
      method: 'POST',
      url: '/modifiers',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { groupId, name: '__modifiers_test_extra_cheese__', priceDelta: '25.00' },
    });
    expect(modifier.statusCode).toBe(201);
    const priceDelta = Number(
      (modifier.json() as { modifier: { priceDelta: string } }).modifier.priceDelta,
    );
    expect(priceDelta).toBeGreaterThan(0);

    const associate = await app.inject({
      method: 'POST',
      url: '/catalog/items/modifier-groups',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId, modifierGroupId: groupId },
    });
    expect(associate.statusCode).toBe(204);

    const groupsForItem = await app.inject({
      method: 'GET',
      url: `/catalog/items/${itemId}/modifier-groups`,
      headers: { cookie },
    });
    const groupNames = (groupsForItem.json() as { groups: { name: string }[] }).groups.map(
      (g) => g.name,
    );
    expect(groupNames).toContain('__modifiers_test_group__');

    // The literal point of this task: a modifier's price_delta actually
    // changes what the line costs.
    const withoutModifier = calculateLineTotal(100, 1, []);
    const withModifier = calculateLineTotal(100, 1, [priceDelta]);
    expect(withModifier).toBeGreaterThan(withoutModifier);
    expect(withModifier).toBe(125);
  });
});
