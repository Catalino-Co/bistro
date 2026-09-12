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
} from './orders.totals.test-helpers.repo.js';

const USERNAME = '__table_map_test_user__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';

interface MapOrder {
  id: number;
  total: string;
  lineCount: number;
  pendingToSend: number;
  dispatchMode: string;
  openedAt: string;
}
interface MapTable {
  id: number;
  name: string;
  seats: number;
  status: string;
  order: MapOrder | null;
}
interface MapArea {
  id: number;
  name: string;
  tables: MapTable[];
}

describe('POS table map', () => {
  const app = buildApp();
  let branch: BranchFixture;
  let cookie: string;
  let csrfToken: string;
  let item: CatalogItemFixture;
  let tableId: number;
  let siblingTableId: number;

  async function fetchMap(): Promise<MapArea[]> {
    const response = await app.inject({
      method: 'GET',
      url: '/orders/table-map',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    return (response.json() as { areas: MapArea[] }).areas;
  }

  beforeAll(async () => {
    const userId = await createTestUser(USERNAME, PASSWORD);
    branch = await createBranchFixture('table-map');
    await assignRole(userId, 'admin', branch.branchId);

    const taxedRateId = await findTaxRateIdByName('ITBIS 18%');
    item = await createCatalogItem('map', taxedRateId);

    const mainArea = await createDineArea(branch.branchId, '__table_map_test_area__');
    tableId = (await createDineTable(mainArea.id, '__table_map_test_table__', 4)).id;
    siblingTableId = (await createDineTable(mainArea.id, '__table_map_test_table_2__', 2)).id;
    // Un área sin mesas: tiene que seguir apareciendo en el mapa.
    await createDineArea(branch.branchId, '__table_map_test_empty_area__');

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
    // La sucursal primero: sus order_lines referencian el ítem del catálogo,
    // así que borrar el catálogo antes choca contra la FK.
    await deleteBranchFixture(branch);
    await deleteCatalogFixtures([item]);
    await deleteTestUser(USERNAME);
    await app.close();
    await closeTestDbPool();
  });

  it('requires a selected branch', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/orders/table-map',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: string }).error).toBe('no_branch_selected');
  });

  it('returns every area and table of the branch, with the live total of each open order', async () => {
    await app.inject({
      method: 'POST',
      url: '/branches/select',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { branchId: branch.branchId },
    });

    // Sin órdenes: todas las mesas libres, y el área vacía presente.
    const emptyMap = await fetchMap();
    expect(emptyMap).toHaveLength(2);
    const emptyArea = emptyMap.find((a) => a.name === '__table_map_test_empty_area__');
    expect(emptyArea?.tables).toEqual([]);
    const mainArea = emptyMap.find((a) => a.name === '__table_map_test_area__')!;
    expect(mainArea.tables).toHaveLength(2);
    expect(mainArea.tables.every((t) => t.order === null)).toBe(true);
    expect(mainArea.tables.every((t) => t.status === 'available')).toBe(true);

    const openOrder = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { dineTableId: tableId },
    });
    expect(openOrder.statusCode).toBe(201);
    const orderId = (openOrder.json() as { order: { id: number } }).order.id;

    // 3 x 10.00 con ITBIS 18% -> 30.00 + 5.40 = 35.40
    await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId: item.itemId, quantity: 3 },
    });

    const map = await fetchMap();
    const area = map.find((a) => a.name === '__table_map_test_area__')!;
    const occupied = area.tables.find((t) => t.id === tableId)!;
    const free = area.tables.find((t) => t.id === siblingTableId)!;

    expect(occupied.status).toBe('occupied');
    expect(occupied.order).toMatchObject({
      id: orderId,
      total: '35.4000',
      lineCount: 1,
      pendingToSend: 1,
      dispatchMode: 'dine_in',
    });
    // La mesa vecina no hereda nada de la orden de al lado.
    expect(free.order).toBeNull();
    expect(free.status).toBe('available');
  });

  it('stops counting a line as pending once it goes to the kitchen', async () => {
    const forTable = await app.inject({
      method: 'GET',
      url: `/orders/for-table/${tableId}`,
      headers: { cookie },
    });
    const orderId = (forTable.json() as { order: { id: number } }).order.id;

    await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/send-to-kitchen`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });

    const map = await fetchMap();
    const table = map.flatMap((area) => area.tables).find((candidate) => candidate.id === tableId)!;
    expect(table.order).toMatchObject({ lineCount: 1, pendingToSend: 0, total: '35.4000' });
  });

  it('drops a table from the map once its order is closed', async () => {
    const forTable = await app.inject({
      method: 'GET',
      url: `/orders/for-table/${tableId}`,
      headers: { cookie },
    });
    const orderId = (forTable.json() as { order: { id: number } }).order.id;

    // Se anula todo para dejar el total en cero y poder cerrar sin pago; lo
    // que importa aquí es que una orden cerrada desaparece del mapa.
    const lines = await app.inject({
      method: 'GET',
      url: `/orders/${orderId}/lines`,
      headers: { cookie },
    });
    for (const line of (lines.json() as { lines: { id: number }[] }).lines) {
      await app.inject({
        method: 'POST',
        url: `/orders/${orderId}/lines/${line.id}/void`,
        headers: { cookie, 'x-csrf-token': csrfToken },
      });
    }

    const close = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/close`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(close.statusCode).toBe(204);

    const map = await fetchMap();
    const table = map.flatMap((area) => area.tables).find((candidate) => candidate.id === tableId)!;
    expect(table.order).toBeNull();
    expect(table.status).toBe('available');
  });
});
