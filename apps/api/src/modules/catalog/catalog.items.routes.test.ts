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
import {
  createCatalogItem,
  deleteCatalogFixtures,
  type CatalogItemFixture,
} from '../orders/orders.totals.test-helpers.repo.js';
import { findTaxRateIdByName } from './catalog.test-helpers.repo.js';

const USERNAME = '__item_archive_test_user__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';

interface Item {
  id: number;
  name: string;
  price: string;
  taxRateId: number;
  status: string;
  archivedAt: string | null;
}

// Fixtures por id, no por patrón de nombre: este archivo corre en paralelo con
// catalog.routes.test.ts, que sí usa una barrida por comodín sobre su propio
// prefijo.
describe('editing and archiving catalog items', () => {
  const app = buildApp();
  let branch: BranchFixture;
  let cookie: string;
  let csrfToken: string;
  let userId: number;
  let fixture: CatalogItemFixture;
  let itemId: number;
  let taxedRateId: number;
  let exemptRateId: number;

  async function listItems(query: string): Promise<Item[]> {
    const response = await app.inject({
      method: 'GET',
      url: `/catalog/items${query}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    return (response.json() as { items: Item[] }).items;
  }

  async function fullPicker(): Promise<Item[]> {
    const response = await app.inject({
      method: 'GET',
      url: '/catalog/items/full',
      headers: { cookie },
    });
    return (response.json() as { items: Item[] }).items;
  }

  function patch(body: Record<string, unknown>) {
    return app.inject({
      method: 'PATCH',
      url: `/catalog/items/${itemId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: body,
    });
  }

  function archive(id = itemId) {
    return app.inject({
      method: 'POST',
      url: `/catalog/items/${id}/archive`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
  }

  function restore(id = itemId) {
    return app.inject({
      method: 'POST',
      url: `/catalog/items/${id}/restore`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
  }

  beforeAll(async () => {
    userId = await createTestUser(USERNAME, PASSWORD);
    branch = await createBranchFixture('item-archive');
    await assignRole(userId, 'admin', branch.branchId);

    taxedRateId = await findTaxRateIdByName('ITBIS 18%');
    exemptRateId = await findTaxRateIdByName('Exento 0%');
    fixture = await createCatalogItem('archive', taxedRateId);
    itemId = fixture.itemId;

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
    await deleteBranchFixture(branch);
    await deleteCatalogFixtures([fixture]);
    await deleteTestUser(USERNAME);
    await app.close();
    await closeTestDbPool();
  });

  it('edits name, price and tax rate', async () => {
    const response = await patch({
      name: '__item_archive_test_renamed__',
      price: '250.00',
      taxRateId: exemptRateId,
    });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { item: Item }).item).toMatchObject({
      name: '__item_archive_test_renamed__',
      taxRateId: exemptRateId,
    });

    const [stored] = await listItems(`?categoryId=${fixture.categoryId}`);
    expect(stored).toMatchObject({ name: '__item_archive_test_renamed__', price: '250.0000' });
  });

  it('rejects an empty patch, a malformed price and a missing item', async () => {
    expect((await patch({})).statusCode).toBe(400);
    expect((await patch({ price: '12.345678' })).statusCode).toBe(400);

    const missing = await app.inject({
      method: 'PATCH',
      url: '/catalog/items/99999999',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { name: 'da igual' },
    });
    expect(missing.statusCode).toBe(404);
  });

  it('rejects an unknown tax rate with 400, not a 500 from the foreign key', async () => {
    const response = await patch({ taxRateId: 99_999_999 });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toBe('tax_rate_not_found');
  });

  it('keeps an inactive item in the catalog but out of the POS picker', async () => {
    expect((await patch({ status: 'inactive' })).statusCode).toBe(200);

    // Sigue en el catálogo, bajo su filtro: es una pausa, no un retiro.
    const inCatalog = await listItems(`?categoryId=${fixture.categoryId}&status=inactive`);
    expect(inCatalog.map((item) => item.id)).toEqual([itemId]);
    // Y ya no está bajo "activos".
    expect(await listItems(`?categoryId=${fixture.categoryId}`)).toEqual([]);
    // Fuera del picker: no se puede vender.
    expect((await fullPicker()).find((item) => item.id === itemId)).toBeUndefined();

    await patch({ status: 'active' });
    expect((await fullPicker()).find((item) => item.id === itemId)).toBeDefined();
  });

  it('archives the item out of the catalog and the picker, forcing it inactive', async () => {
    const response = await archive();
    expect(response.statusCode).toBe(200);

    // Igualdad exacta, no `not.toContain`: atrapa un filtro que solo reordena.
    expect(await listItems(`?categoryId=${fixture.categoryId}`)).toEqual([]);
    expect(await listItems(`?categoryId=${fixture.categoryId}&status=inactive`)).toEqual([]);
    expect((await fullPicker()).find((item) => item.id === itemId)).toBeUndefined();

    const [archived] = await listItems(`?categoryId=${fixture.categoryId}&status=archived`);
    expect(archived?.id).toBe(itemId);
    expect(archived?.archivedAt).not.toBeNull();
    // La invariante: archivar fuerza inactivo, para que una consulta que solo
    // mire el status siga excluyéndolo.
    expect(archived?.status).toBe('inactive');
  });

  it('refuses to edit or re-archive something already archived', async () => {
    const edit = await patch({ name: 'no debería pasar' });
    expect(edit.statusCode).toBe(409);
    expect((edit.json() as { error: string }).error).toBe('item_archived');

    const again = await archive();
    expect(again.statusCode).toBe(409);
    expect((again.json() as { error: string }).error).toBe('already_archived');
  });

  it('restores the item as inactive, never straight back on sale', async () => {
    const response = await restore();
    expect(response.statusCode).toBe(200);

    const [restored] = await listItems(`?categoryId=${fixture.categoryId}&status=inactive`);
    expect(restored?.id).toBe(itemId);
    expect(restored?.archivedAt).toBeNull();
    // Esta es la aserción que atrapa un restore que vuelve a poner algo a la
    // venta en silencio, a un precio que puede llevar un año sin mirarse.
    expect(restored?.status).toBe('inactive');
    expect((await fullPicker()).find((item) => item.id === itemId)).toBeUndefined();

    const notArchived = await restore();
    expect(notArchived.statusCode).toBe(409);
    expect((notArchived.json() as { error: string }).error).toBe('not_archived');
  });

  it('leaves every edit, archive and restore in the audit trail', async () => {
    const updates = await findAuditEvents('catalog.item_updated', String(itemId));
    const archived = await findAuditEvents('catalog.item_archived', String(itemId));
    const restored = await findAuditEvents('catalog.item_restored', String(itemId));

    expect(updates.length).toBeGreaterThan(0);
    expect(archived).toHaveLength(1);
    expect(restored).toHaveLength(1);
    for (const event of [...updates, ...archived, ...restored]) {
      expect(event).toMatchObject({ entityType: 'item', userId });
    }
  });

  it('refuses an unknown id on archive and restore', async () => {
    expect((await archive(99_999_999)).statusCode).toBe(404);
    expect((await restore(99_999_999)).statusCode).toBe(404);
  });
});
