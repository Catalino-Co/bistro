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
import { deleteSubfamilyFixture, findTaxRateIdByName } from './catalog.test-helpers.repo.js';

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
describe('archiving families, subfamilies and categories', () => {
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
      { path: 'categories', id: fixture.categoryId },
      { path: 'subfamilies', id: fixture.subfamilyId },
      { path: 'families', id: fixture.familyId },
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
    // Se pausa la categoría a mano, luego se archiva la familia entera.
    await app.inject({
      method: 'PATCH',
      url: `/catalog/categories/${fixture.categoryId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { status: 'inactive' },
    });
    expect((await archive('families', fixture.familyId)).statusCode).toBe(200);

    // La categoría sigue como estaba: inactiva, NO archivada.
    const [category] = await list('categories', `?subfamilyId=${fixture.subfamilyId}&status=inactive`);
    expect(category?.id).toBe(fixture.categoryId);
    expect(category?.archivedAt).toBeNull();
    expect(await list('categories', `?subfamilyId=${fixture.subfamilyId}&status=archived`)).toEqual([]);

    // Y el ítem tampoco se tocó: sigue activo, solo que oculto por su
    // ascendencia, así que no sale bajo "activos" del catálogo... sí sale,
    // porque el catálogo lista cada nivel por su propio estado. Lo que no
    // debe estar es archivado.
    const itemsResponse = await app.inject({
      method: 'GET',
      url: `/catalog/items?categoryId=${fixture.categoryId}&status=archived`,
      headers: { cookie },
    });
    expect((itemsResponse.json() as { items: Node[] }).items).toEqual([]);

    await restore('families', fixture.familyId);
    await app.inject({
      method: 'PATCH',
      url: `/catalog/families/${fixture.familyId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { status: 'active' },
    });
    await app.inject({
      method: 'PATCH',
      url: `/catalog/categories/${fixture.categoryId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { status: 'active' },
    });
    expect(await inPicker()).toBe(true);
  });

  it('refuses to hang new children off an archived parent', async () => {
    expect((await archive('families', fixture.familyId)).statusCode).toBe(200);

    const subfamily = await app.inject({
      method: 'POST',
      url: '/catalog/subfamilies',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { familyId: fixture.familyId, name: '__tree_archive_test_orphan__' },
    });
    expect(subfamily.statusCode).toBe(409);
    expect((subfamily.json() as { error: string }).error).toBe('parent_archived');

    await restore('families', fixture.familyId);
    await app.inject({
      method: 'PATCH',
      url: `/catalog/families/${fixture.familyId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { status: 'active' },
    });
  });

  it('refuses to hang new children off an archived GRANDparent too', async () => {
    // El caso que se colaba: la subfamilia y la categoria siguen vivas, pero
    // su familia esta archivada. Mirando solo al padre directo, la categoria
    // y el item nacian invisibles -- el picker exige toda la ascendencia.
    expect((await archive('families', fixture.familyId)).statusCode).toBe(200);

    const category = await app.inject({
      method: 'POST',
      url: '/catalog/categories',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { subfamilyId: fixture.subfamilyId, name: '__tree_archive_test_grandorphan__' },
    });
    expect(category.statusCode).toBe(409);
    expect((category.json() as { error: string }).error).toBe('parent_archived');

    // Y dos niveles mas abajo, con la familia archivada como bisabuela.
    const item = await app.inject({
      method: 'POST',
      url: '/catalog/items',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: {
        categoryId: fixture.categoryId,
        name: '__tree_archive_test_grandorphan_item__',
        price: '10.00',
        taxRateId: await findTaxRateIdByName('ITBIS 18%'),
      },
    });
    expect(item.statusCode).toBe(409);
    expect((item.json() as { error: string }).error).toBe('parent_archived');

    await restore('families', fixture.familyId);
  });

  it('still hangs children off a PAUSED parent -- pausar no es retirar', async () => {
    // El contrapunto que fija la regla: el guard mira `archived_at`, nunca
    // `status`. Montar una rama entera antes de abrirla a la venta tiene que
    // seguir siendo posible.
    const paused = await app.inject({
      method: 'PATCH',
      url: `/catalog/families/${fixture.familyId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { status: 'inactive' },
    });
    expect(paused.statusCode).toBe(200);

    const subfamily = await app.inject({
      method: 'POST',
      url: '/catalog/subfamilies',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { familyId: fixture.familyId, name: '__tree_archive_test_paused_child__' },
    });
    expect(subfamily.statusCode).toBe(201);
    // Se limpia aqui mismo: `deleteCatalogFixtures` solo borra los ids del
    // fixture, y esta subfamilia de mas bloquearia el borrado de la familia.
    await deleteSubfamilyFixture(
      (subfamily.json() as { subfamily: { id: number } }).subfamily.id,
    );

    await app.inject({
      method: 'PATCH',
      url: `/catalog/families/${fixture.familyId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { status: 'active' },
    });
  });

  it('renames a level and refuses to edit an archived one', async () => {
    const renamed = await app.inject({
      method: 'PATCH',
      url: `/catalog/subfamilies/${fixture.subfamilyId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { name: '__tree_archive_test_renamed__' },
    });
    expect(renamed.statusCode).toBe(200);
    expect((renamed.json() as { node: Node }).node.name).toBe('__tree_archive_test_renamed__');

    await archive('subfamilies', fixture.subfamilyId);
    const blocked = await app.inject({
      method: 'PATCH',
      url: `/catalog/subfamilies/${fixture.subfamilyId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { name: 'no debería pasar' },
    });
    expect(blocked.statusCode).toBe(409);
    expect((blocked.json() as { error: string }).error).toBe('node_archived');

    expect((await archive('subfamilies', fixture.subfamilyId)).statusCode).toBe(409);
    await restore('subfamilies', fixture.subfamilyId);
    expect((await restore('subfamilies', fixture.subfamilyId)).statusCode).toBe(409);
  });

  it('records every level change in the audit trail', async () => {
    for (const [key, id] of [
      ['catalog.family_archived', fixture.familyId],
      ['catalog.subfamily_archived', fixture.subfamilyId],
      ['catalog.category_archived', fixture.categoryId],
    ] as const) {
      const events = await findAuditEvents(key, String(id));
      expect(events.length).toBeGreaterThan(0);
      expect(events[0]).toMatchObject({ userId });
    }
  });

  it('404s for an unknown id at every level', async () => {
    for (const path of ['families', 'subfamilies', 'categories']) {
      expect((await archive(path, 99_999_999)).statusCode).toBe(404);
      expect((await restore(path, 99_999_999)).statusCode).toBe(404);
    }
  });

  it('lists every state at once with status=all, so no branch is unreachable', async () => {
    // De esto dependen los selectores de padre de las pantallas del catálogo:
    // una categoría puede colgar de una subfamilia pausada, y si el selector
    // solo ofreciera las activas esa rama entera quedaría fuera del alcance
    // de la interfaz -- justo lo contrario de archivar en vez de borrar.
    const query = `?subfamilyId=${fixture.subfamilyId}`;
    expect((await archive('categories', fixture.categoryId)).statusCode).toBe(200);

    expect((await list('categories', `${query}&status=active`)).map((n) => n.id)).not.toContain(
      fixture.categoryId,
    );
    expect((await list('categories', `${query}&status=all`)).map((n) => n.id)).toContain(
      fixture.categoryId,
    );

    // Y `all` no es un cuarto estado: trae exactamente los otros tres juntos.
    const byState = [
      ...(await list('categories', `${query}&status=active`)),
      ...(await list('categories', `${query}&status=inactive`)),
      ...(await list('categories', `${query}&status=archived`)),
    ];
    expect((await list('categories', `${query}&status=all`)).map((n) => n.id).sort()).toEqual(
      byState.map((n) => n.id).sort(),
    );

    expect((await restore('categories', fixture.categoryId)).statusCode).toBe(200);

    const bogus = await app.inject({
      method: 'GET',
      url: `/catalog/categories${query}&status=todas`,
      headers: { cookie },
    });
    expect(bogus.statusCode).toBe(400);
  });
});
