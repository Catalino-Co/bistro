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

const USERNAME = '__tree_archive_test_user__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';

interface Node {
  id: number;
  name: string;
  status: string;
  archivedAt: string | null;
}

/**
 * Archivar un nivel del árbol saca del POS todo lo que cuelga de él sin
 * escribir una sola fila en sus hijos. Estos tests fijan las dos mitades:
 * que el picker respeta la ascendencia, y que restaurar devuelve el estado
 * exacto que cada hijo tenía.
 */
describe('archiving categories, families and subfamilies', () => {
  const app = buildApp();
  let branch: BranchFixture;
  let cookie: string;
  let csrfToken: string;
  let userId: number;
  let fixture: CatalogItemFixture;

  async function list(path: string, query = ''): Promise<Node[]> {
    const response = await app.inject({
      method: 'GET',
      url: `/catalog/${path}${query}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, Node[]>;
    return body[path] ?? [];
  }

  async function inPicker(): Promise<boolean> {
    const response = await app.inject({
      method: 'GET',
      url: '/catalog/items/full',
      headers: { cookie },
    });
    const { items } = response.json() as { items: { id: number }[] };
    return items.some((item) => item.id === fixture.itemId);
  }

  function archive(path: string, id: number) {
    return app.inject({
      method: 'POST',
      url: `/catalog/${path}/${id}/archive`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
  }

  function restore(path: string, id: number) {
    return app.inject({
      method: 'POST',
      url: `/catalog/${path}/${id}/restore`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
  }

  beforeAll(async () => {
    userId = await createTestUser(USERNAME, PASSWORD);
    branch = await createBranchFixture('tree-archive');
    await assignRole(userId, 'admin', branch.branchId);
    fixture = await createCatalogItem('tree', await findTaxRateIdByName('ITBIS 18%'));

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

  it('takes the whole branch out of the POS when any ancestor is archived', async () => {
    expect(await inPicker()).toBe(true);

    // Cada nivel, de abajo a arriba: archivar y comprobar que el ítem -- que
    // sigue activo -- desaparece del picker de todas formas.
    const levels: { path: string; id: number }[] = [
      { path: 'subfamilies', id: fixture.subfamilyId },
      { path: 'families', id: fixture.familyId },
      { path: 'categories', id: fixture.categoryId },
    ];

    for (const level of levels) {
      expect((await archive(level.path, level.id)).statusCode).toBe(200);
      expect(await inPicker()).toBe(false);
      expect((await restore(level.path, level.id)).statusCode).toBe(200);
      // Restaurar deja el nivel INACTIVO, así que el ítem sigue fuera hasta
      // que alguien lo reactive a propósito.
      expect(await inPicker()).toBe(false);

      const reactivated = await app.inject({
        method: 'PATCH',
        url: `/catalog/${level.path}/${level.id}`,
        headers: { cookie, 'x-csrf-token': csrfToken },
        payload: { status: 'active' },
      });
      expect(reactivated.statusCode).toBe(200);
      expect(await inPicker()).toBe(true);
    }
  });

  it('never writes to the children, so restoring gives back exactly what was there', async () => {
    // Se pausa la subfamilia a mano, luego se archiva la categoría entera.
    await app.inject({
      method: 'PATCH',
      url: `/catalog/subfamilies/${fixture.subfamilyId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { status: 'inactive' },
    });
    expect((await archive('categories', fixture.categoryId)).statusCode).toBe(200);

    // La subfamilia sigue como estaba: inactiva, NO archivada.
    const [subfamily] = await list('subfamilies', `?familyId=${fixture.familyId}&status=inactive`);
    expect(subfamily?.id).toBe(fixture.subfamilyId);
    expect(subfamily?.archivedAt).toBeNull();
    expect(await list('subfamilies', `?familyId=${fixture.familyId}&status=archived`)).toEqual([]);

    // Y el ítem tampoco se tocó: sigue activo, solo que oculto por su
    // ascendencia, así que no sale bajo "activos" del catálogo... sí sale,
    // porque el catálogo lista cada nivel por su propio estado. Lo que no
    // debe estar es archivado.
    const itemsResponse = await app.inject({
      method: 'GET',
      url: `/catalog/items?subfamilyId=${fixture.subfamilyId}&status=archived`,
      headers: { cookie },
    });
    expect((itemsResponse.json() as { items: Node[] }).items).toEqual([]);

    await restore('categories', fixture.categoryId);
    await app.inject({
      method: 'PATCH',
      url: `/catalog/categories/${fixture.categoryId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { status: 'active' },
    });
    await app.inject({
      method: 'PATCH',
      url: `/catalog/subfamilies/${fixture.subfamilyId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { status: 'active' },
    });
    expect(await inPicker()).toBe(true);
  });

  it('refuses to hang new children off an archived parent', async () => {
    expect((await archive('categories', fixture.categoryId)).statusCode).toBe(200);

    const family = await app.inject({
      method: 'POST',
      url: '/catalog/families',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { categoryId: fixture.categoryId, name: '__tree_archive_test_orphan__' },
    });
    expect(family.statusCode).toBe(409);
    expect((family.json() as { error: string }).error).toBe('parent_archived');

    await restore('categories', fixture.categoryId);
    await app.inject({
      method: 'PATCH',
      url: `/catalog/categories/${fixture.categoryId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { status: 'active' },
    });
  });

  it('renames a level and refuses to edit an archived one', async () => {
    const renamed = await app.inject({
      method: 'PATCH',
      url: `/catalog/families/${fixture.familyId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { name: '__tree_archive_test_renamed__' },
    });
    expect(renamed.statusCode).toBe(200);
    expect((renamed.json() as { node: Node }).node.name).toBe('__tree_archive_test_renamed__');

    await archive('families', fixture.familyId);
    const blocked = await app.inject({
      method: 'PATCH',
      url: `/catalog/families/${fixture.familyId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { name: 'no debería pasar' },
    });
    expect(blocked.statusCode).toBe(409);
    expect((blocked.json() as { error: string }).error).toBe('node_archived');

    expect((await archive('families', fixture.familyId)).statusCode).toBe(409);
    await restore('families', fixture.familyId);
    expect((await restore('families', fixture.familyId)).statusCode).toBe(409);
  });

  it('records every level change in the audit trail', async () => {
    for (const [key, id] of [
      ['catalog.category_archived', fixture.categoryId],
      ['catalog.family_archived', fixture.familyId],
      ['catalog.subfamily_archived', fixture.subfamilyId],
    ] as const) {
      const events = await findAuditEvents(key, String(id));
      expect(events.length).toBeGreaterThan(0);
      expect(events[0]).toMatchObject({ userId });
    }
  });

  it('404s for an unknown id at every level', async () => {
    for (const path of ['categories', 'families', 'subfamilies']) {
      expect((await archive(path, 99_999_999)).statusCode).toBe(404);
      expect((await restore(path, 99_999_999)).statusCode).toBe(404);
    }
  });
});
