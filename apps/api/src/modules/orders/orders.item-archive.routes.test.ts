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

const USERNAME = '__archive_history_test_user__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';

interface Line {
  id: number;
  itemId: number;
  itemName: string;
  quantity: number;
  unitPrice: string;
  voidedAt: string | null;
}
interface Totals {
  subtotal: string;
  taxTotal: string;
  total: string;
}

/**
 * La otra mitad de archivar: lo que NO debe pasar.
 *
 * Archivar un ítem lo saca del catálogo y del POS, pero no puede tocar nada
 * de lo ya vendido. Estos tests fijan esa frontera -- en particular el de los
 * totales, que es el único sitio donde un filtro de estado mal puesto no daría
 * error: borraría la línea del subtotal en silencio.
 */
describe('archiving an item never rewrites history', () => {
  const app = buildApp();
  let branch: BranchFixture;
  let cookie: string;
  let csrfToken: string;
  let sold: CatalogItemFixture;
  let spare: CatalogItemFixture;
  let orderId: number;
  let lineId: number;

  async function lines(): Promise<Line[]> {
    const response = await app.inject({
      method: 'GET',
      url: `/orders/${orderId}/lines`,
      headers: { cookie },
    });
    return (response.json() as { lines: Line[] }).lines;
  }

  async function totals(): Promise<Totals> {
    const response = await app.inject({
      method: 'GET',
      url: `/orders/${orderId}/totals`,
      headers: { cookie },
    });
    return response.json() as Totals;
  }

  function addLine(itemId: number, quantity = 1) {
    return app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId, quantity },
    });
  }

  function archive(itemId: number) {
    return app.inject({
      method: 'POST',
      url: `/catalog/items/${itemId}/archive`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
  }

  beforeAll(async () => {
    const userId = await createTestUser(USERNAME, PASSWORD);
    branch = await createBranchFixture('archive-history');
    await assignRole(userId, 'admin', branch.branchId);

    const taxRateId = await findTaxRateIdByName('ITBIS 18%');
    sold = await createCatalogItem('archived-sold', taxRateId);
    spare = await createCatalogItem('archived-spare', taxRateId);

    const area = await createDineArea(branch.branchId, '__archive_history_test_area__');
    const tableId = (await createDineTable(area.id, '__archive_history_test_table__', 4)).id;

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

    const opened = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { dineTableId: tableId },
    });
    orderId = (opened.json() as { order: { id: number } }).order.id;
  });

  afterAll(async () => {
    await deleteBranchFixture(branch);
    await deleteCatalogFixtures([sold, spare]);
    await deleteTestUser(USERNAME);
    await app.close();
    await closeTestDbPool();
  });

  it('refuses to add a line for an inactive or archived item', async () => {
    await app.inject({
      method: 'PATCH',
      url: `/catalog/items/${spare.itemId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { status: 'inactive' },
    });
    const inactive = await addLine(spare.itemId);
    expect(inactive.statusCode).toBe(409);
    expect((inactive.json() as { error: string }).error).toBe('item_not_available');

    expect((await archive(spare.itemId)).statusCode).toBe(200);
    const archived = await addLine(spare.itemId);
    expect(archived.statusCode).toBe(409);
    expect((archived.json() as { error: string }).error).toBe('item_not_available');

    // Un id que no existe sigue siendo 404, no 409.
    expect((await addLine(99_999_999)).statusCode).toBe(404);
  });

  it('keeps the line, its name and the totals untouched after archiving', async () => {
    // 2 x 10.00 -> 20.00 + 3.60 = 23.60
    expect((await addLine(sold.itemId, 2)).statusCode).toBe(201);
    const [line] = await lines();
    lineId = line!.id;
    const before = await totals();
    expect(before).toMatchObject({ subtotal: '20.0000', total: '23.6000' });

    expect((await archive(sold.itemId)).statusCode).toBe(200);

    const [after] = await lines();
    expect(after).toMatchObject({
      id: lineId,
      quantity: 2,
      unitPrice: '10.0000',
      // El nombre sigue resolviéndose: el join de la lectura no filtra.
      itemName: '__order_totals_test_item_archived-sold__',
    });

    // La aserción que importa: idénticos. Un predicado de estado en el join de
    // order-totals.repo.ts no daría error, solo borraría la línea del subtotal.
    expect(await totals()).toEqual(before);
  });

  it('still lets the line be edited and voided once its item is archived', async () => {
    const edited = await app.inject({
      method: 'PATCH',
      url: `/orders/${orderId}/lines/${lineId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { quantity: 3 },
    });
    expect(edited.statusCode).toBe(200);
    expect(await totals()).toMatchObject({ subtotal: '30.0000', total: '35.4000' });

    const voided = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines/${lineId}/void`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: {},
    });
    expect(voided.statusCode).toBe(204);
    const [line] = await lines();
    expect(line?.voidedAt).not.toBeNull();
    expect(await totals()).toMatchObject({ total: '0.0000' });
  });

  it('does not rewrite a sold line when the item price changes', async () => {
    // El ítem archivado no se puede editar, así que se restaura primero.
    await app.inject({
      method: 'POST',
      url: `/catalog/items/${sold.itemId}/restore`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    await app.inject({
      method: 'PATCH',
      url: `/catalog/items/${sold.itemId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { status: 'active' },
    });

    expect((await addLine(sold.itemId, 1)).statusCode).toBe(201);
    const beforePriceChange = await totals();

    await app.inject({
      method: 'PATCH',
      url: `/catalog/items/${sold.itemId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { price: '99.00' },
    });

    const live = (await lines()).filter((line) => line.voidedAt === null);
    // El precio de la línea se congeló al venderse.
    expect(live[0]?.unitPrice).toBe('10.0000');
    expect(await totals()).toEqual(beforePriceChange);
  });
});
