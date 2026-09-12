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

  it('creates a kitchen station and routes an item to it', async () => {
    const station = await app.inject({
      method: 'POST',
      url: '/catalog/kitchen-stations',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { name: '__catalog_test_station__' },
    });
    expect(station.statusCode).toBe(201);
    const stationId = (station.json() as { kitchenStation: { id: number } }).kitchenStation.id;

    const list = await app.inject({
      method: 'GET',
      url: '/catalog/kitchen-stations',
      headers: { cookie },
    });
    const stationNames = (
      list.json() as { kitchenStations: { name: string }[] }
    ).kitchenStations.map((s) => s.name);
    expect(stationNames).toContain('__catalog_test_station__');

    const category = await app.inject({
      method: 'POST',
      url: '/catalog/categories',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { name: '__catalog_test_station_cat__' },
    });
    const categoryId = (category.json() as { category: { id: number } }).category.id;
    const family = await app.inject({
      method: 'POST',
      url: '/catalog/families',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { categoryId, name: '__catalog_test_station_fam__' },
    });
    const familyId = (family.json() as { family: { id: number } }).family.id;
    const subfamily = await app.inject({
      method: 'POST',
      url: '/catalog/subfamilies',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { familyId, name: '__catalog_test_station_sub__' },
    });
    const subfamilyId = (subfamily.json() as { subfamily: { id: number } }).subfamily.id;

    const taxRateId = await findTaxRateIdByName('ITBIS 18%');
    const itemWithStation = await app.inject({
      method: 'POST',
      url: '/catalog/items',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: {
        subfamilyId,
        name: '__catalog_test_station_item__',
        price: '50.00',
        taxRateId,
        stationId,
      },
    });
    expect(itemWithStation.statusCode).toBe(201);
    const itemId = (itemWithStation.json() as { item: { id: number; stationId: number | null } })
      .item.id;
    expect((itemWithStation.json() as { item: { stationId: number | null } }).item.stationId).toBe(
      stationId,
    );

    // A second, existing item can also be routed after the fact.
    const noStationItem = await app.inject({
      method: 'POST',
      url: '/catalog/items',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { subfamilyId, name: '__catalog_test_station_item2__', price: '30.00', taxRateId },
    });
    const noStationItemId = (noStationItem.json() as { item: { id: number; stationId: number | null } })
      .item.id;
    expect(
      (noStationItem.json() as { item: { stationId: number | null } }).item.stationId,
    ).toBeNull();

    const assign = await app.inject({
      method: 'PATCH',
      url: `/catalog/items/${noStationItemId}/station`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { stationId },
    });
    expect(assign.statusCode).toBe(204);

    const itemsAfter = await app.inject({
      method: 'GET',
      url: `/catalog/items?subfamilyId=${subfamilyId}`,
      headers: { cookie },
    });
    const stationsById = new Map(
      (itemsAfter.json() as { items: { id: number; stationId: number | null }[] }).items.map((i) => [
        i.id,
        i.stationId,
      ]),
    );
    expect(stationsById.get(itemId)).toBe(stationId);
    expect(stationsById.get(noStationItemId)).toBe(stationId);
  });

  it('configures, updates, and clears a station printer', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/catalog/kitchen-stations',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: {
        name: '__catalog_test_station_printer__',
        printerHost: '192.168.1.50',
        printerPort: 9100,
      },
    });
    expect(created.statusCode).toBe(201);
    const stationId = (created.json() as { kitchenStation: { id: number } }).kitchenStation.id;
    expect(
      (created.json() as { kitchenStation: { printerHost: string; printerPort: number } })
        .kitchenStation,
    ).toMatchObject({ printerHost: '192.168.1.50', printerPort: 9100 });

    const mismatched = await app.inject({
      method: 'POST',
      url: '/catalog/kitchen-stations',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { name: '__catalog_test_station_bad__', printerHost: '10.0.0.1' },
    });
    expect(mismatched.statusCode).toBe(400);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/catalog/kitchen-stations/${stationId}/printer`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { printerHost: '192.168.1.99', printerPort: 9101 },
    });
    expect(updated.statusCode).toBe(204);

    const cleared = await app.inject({
      method: 'PATCH',
      url: `/catalog/kitchen-stations/${stationId}/printer`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { printerHost: null, printerPort: null },
    });
    expect(cleared.statusCode).toBe(204);

    const list = await app.inject({
      method: 'GET',
      url: '/catalog/kitchen-stations',
      headers: { cookie },
    });
    const station = (
      list.json() as {
        kitchenStations: { id: number; printerHost: string | null; printerPort: number | null }[];
      }
    ).kitchenStations.find((s) => s.id === stationId);
    expect(station).toMatchObject({ printerHost: null, printerPort: null });
  });
});
