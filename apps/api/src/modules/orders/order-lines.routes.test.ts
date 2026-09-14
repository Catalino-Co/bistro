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
import { findPaymentMethodIdByName } from '../payments/payments.test-helpers.repo.js';
import {
  createItemFixture,
  createModifierFixture,
  deleteOrdersTestData,
} from './orders.test-helpers.repo.js';

const USERNAME = '__order_lines_test_user__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';

describe('order lines routes', () => {
  const app = buildApp();
  let branch: BranchFixture;
  let cookie: string;
  let csrfToken: string;
  let itemId: number;
  let unrelatedItemId: number;
  let modifierId: number;
  let orderId: number;
  let cashMethodId: number;

  beforeAll(async () => {
    const userId = await createTestUser(USERNAME, PASSWORD);
    branch = await createBranchFixture('order-lines');
    await assignRole(userId, 'admin', branch.branchId);

    const taxRateId = await findTaxRateIdByName('ITBIS 18%');
    itemId = (await createItemFixture('main', taxRateId)).itemId;
    unrelatedItemId = (await createItemFixture('unrelated', taxRateId)).itemId;
    modifierId = (await createModifierFixture('extra', itemId, '25.0000')).modifierId;
    cashMethodId = await findPaymentMethodIdByName('Efectivo');

    const dineAreaId = (await createDineArea(branch.branchId, '__order_lines_test_area__')).id;
    const table = await createDineTable(dineAreaId, '__order_lines_test_table__', 4);

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

    const openOrder = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { dineTableId: table.id },
    });
    orderId = (openOrder.json() as { order: { id: number } }).order.id;
  });

  afterAll(async () => {
    await deleteBranchFixture(branch);
    await deleteOrdersTestData();
    await deleteTestUser(USERNAME);
    await app.close();
    // Pool teardown happens once, in the last describe of this file --
    // pool.end() is a module-wide singleton (see closeTestDbPool), and a
    // second describe's beforeAll would fail against an already-ended pool.
  });

  it('adds two lines of the same item with different notes and a modifier', async () => {
    const firstLine = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId, quantity: 2, note: 'sin cebolla', modifierIds: [modifierId] },
    });
    expect(firstLine.statusCode).toBe(201);
    const firstBody = firstLine.json() as {
      line: { note: string | null; unitPrice: string; modifiers: { modifierId: number }[] };
    };
    expect(firstBody.line.note).toBe('sin cebolla');
    expect(firstBody.line.unitPrice).toBe('10.0000');
    expect(firstBody.line.modifiers).toEqual([
      { modifierId, name: '__orders_test_mod_extra__', priceDelta: '25.0000' },
    ]);

    const secondLine = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId, quantity: 1, note: 'bien cocido' },
    });
    expect(secondLine.statusCode).toBe(201);
    expect((secondLine.json() as { line: { note: string | null } }).line.note).toBe('bien cocido');

    const list = await app.inject({
      method: 'GET',
      url: `/orders/${orderId}/lines`,
      headers: { cookie },
    });
    const notes = (list.json() as { lines: { note: string | null }[] }).lines.map((l) => l.note);
    expect(notes.sort()).toEqual(['bien cocido', 'sin cebolla']);
  });

  it('rejects a modifier not associated with the item', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId: unrelatedItemId, quantity: 1, modifierIds: [modifierId] },
    });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toBe('modifier_not_allowed');
  });

  it('rejects every modifier once the item has them switched off', async () => {
    // El interruptor del item no vale nada si solo lo respeta la pantalla:
    // un cliente que siga mandando el modificador tiene que chocar aqui.
    const off = await app.inject({
      method: 'PATCH',
      url: `/catalog/items/${itemId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { usesModifiers: false },
    });
    expect(off.statusCode).toBe(200);
    expect((off.json() as { item: { usesModifiers: boolean } }).item.usesModifiers).toBe(false);

    const rejected = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId, quantity: 1, modifierIds: [modifierId] },
    });
    expect(rejected.statusCode).toBe(400);
    expect((rejected.json() as { error: string }).error).toBe('modifier_not_allowed');

    // Pero el item se sigue vendiendo: lo que se apago son sus extras.
    const plain = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId, quantity: 1 },
    });
    expect(plain.statusCode).toBe(201);

    // Y apagar no borra nada: el grupo sigue asociado y al encender vuelve.
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/catalog/items/${itemId}/modifier-groups`,
          headers: { cookie },
        })
      ).json() as { groups: unknown[] },
    ).toHaveProperty('groups.length', 1);

    await app.inject({
      method: 'PATCH',
      url: `/catalog/items/${itemId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { usesModifiers: true },
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/orders/${orderId}/lines`,
          headers: { cookie, 'x-csrf-token': csrfToken },
          payload: { itemId, quantity: 1, modifierIds: [modifierId] },
        })
      ).statusCode,
    ).toBe(201);
  });

  it('stops allowing a modifier once its group is taken off the item', async () => {
    const groups = (
      await app.inject({
        method: 'GET',
        url: `/catalog/items/${itemId}/modifier-groups`,
        headers: { cookie },
      })
    ).json() as { groups: { id: number }[] };
    const groupId = groups.groups[0]!.id;

    const removed = await app.inject({
      method: 'DELETE',
      url: `/catalog/items/${itemId}/modifier-groups/${groupId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(removed.statusCode).toBe(204);

    const rejected = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId, quantity: 1, modifierIds: [modifierId] },
    });
    expect(rejected.statusCode).toBe(400);
    expect((rejected.json() as { error: string }).error).toBe('modifier_not_allowed');

    // Las lineas que ya lo llevaban conservan su modificador: lo que se pidio
    // vive en `order_line_modifiers`, no en la asociacion del catalogo.
    const lines = (
      await app.inject({ method: 'GET', url: `/orders/${orderId}/lines`, headers: { cookie } })
    ).json() as { lines: { modifiers: { modifierId: number }[] }[] };
    expect(lines.lines.some((line) => line.modifiers.some((m) => m.modifierId === modifierId))).toBe(
      true,
    );
  });

  it('rejects adding a line to a closed order', async () => {
    const totals = await app.inject({
      method: 'GET',
      url: `/orders/${orderId}/totals`,
      headers: { cookie },
    });
    await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/payments`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: {
        paymentMethodId: cashMethodId,
        amount: (totals.json() as { total: string }).total,
      },
    });

    const closeResponse = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/close`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(closeResponse.statusCode).toBe(204);

    const response = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId, quantity: 1 },
    });
    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: string }).error).toBe('order_closed');
  });
});

describe('update and void order lines', () => {
  const app = buildApp();
  let branch: BranchFixture;
  let cookie: string;
  let csrfToken: string;
  let itemId: number;
  let modifierId: number;
  let unrelatedModifierId: number;
  let orderId: number;
  let cashMethodId: number;

  beforeAll(async () => {
    const userId = await createTestUser(USERNAME, PASSWORD);
    branch = await createBranchFixture('update-void');
    await assignRole(userId, 'admin', branch.branchId);

    const taxRateId = await findTaxRateIdByName('ITBIS 18%');
    itemId = (await createItemFixture('uv-main', taxRateId)).itemId;
    const unrelatedItemId = (await createItemFixture('uv-unrelated', taxRateId)).itemId;
    modifierId = (await createModifierFixture('uv-extra', itemId, '25.0000')).modifierId;
    unrelatedModifierId = (
      await createModifierFixture('uv-unrelated-mod', unrelatedItemId, '10.0000')
    ).modifierId;
    cashMethodId = await findPaymentMethodIdByName('Efectivo');

    const dineAreaId = (await createDineArea(branch.branchId, '__order_lines_test_area_uv__')).id;
    const table = await createDineTable(dineAreaId, '__order_lines_test_table_uv__', 4);

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

    const openOrder = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { dineTableId: table.id },
    });
    orderId = (openOrder.json() as { order: { id: number } }).order.id;
  });

  afterAll(async () => {
    await deleteBranchFixture(branch);
    await deleteOrdersTestData();
    await deleteTestUser(USERNAME);
    await app.close();
    await closeTestDbPool();
  });

  it('updates quantity, note, and modifiers on a line', async () => {
    const added = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId, quantity: 1, note: 'original' },
    });
    const lineId = (added.json() as { line: { id: number } }).line.id;

    const updated = await app.inject({
      method: 'PATCH',
      url: `/orders/${orderId}/lines/${lineId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { quantity: 3, note: 'sin sal', modifierIds: [modifierId] },
    });
    expect(updated.statusCode).toBe(200);
    const body = updated.json() as {
      line: { quantity: number; note: string | null; modifiers: { modifierId: number }[] };
    };
    expect(body.line.quantity).toBe(3);
    expect(body.line.note).toBe('sin sal');
    expect(body.line.modifiers).toEqual([
      { modifierId, name: '__orders_test_mod_uv-extra__', priceDelta: '25.0000' },
    ]);
  });

  it('rejects updating with a modifier not associated with the item', async () => {
    const added = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId, quantity: 1 },
    });
    const lineId = (added.json() as { line: { id: number } }).line.id;

    const response = await app.inject({
      method: 'PATCH',
      url: `/orders/${orderId}/lines/${lineId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { quantity: 1, modifierIds: [unrelatedModifierId] },
    });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toBe('modifier_not_allowed');
  });

  it('voids a line, keeps it listed with voidedAt set, and rejects double-void/edit', async () => {
    const added = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId, quantity: 1 },
    });
    const lineId = (added.json() as { line: { id: number } }).line.id;

    const voided = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines/${lineId}/void`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { reason: 'cliente cambió de opinión' },
    });
    expect(voided.statusCode).toBe(204);

    const list = await app.inject({
      method: 'GET',
      url: `/orders/${orderId}/lines`,
      headers: { cookie },
    });
    const line = (list.json() as { lines: { id: number; voidedAt: string | null }[] }).lines.find(
      (l) => l.id === lineId,
    );
    expect(line?.voidedAt).not.toBeNull();

    const doubleVoid = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines/${lineId}/void`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: {},
    });
    expect(doubleVoid.statusCode).toBe(409);
    expect((doubleVoid.json() as { error: string }).error).toBe('already_voided');

    const editVoided = await app.inject({
      method: 'PATCH',
      url: `/orders/${orderId}/lines/${lineId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { quantity: 1 },
    });
    expect(editVoided.statusCode).toBe(409);
    expect((editVoided.json() as { error: string }).error).toBe('line_voided');
  });

  it('rejects update/void on a closed order', async () => {
    const added = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId, quantity: 1 },
    });
    const lineId = (added.json() as { line: { id: number } }).line.id;

    const totals = await app.inject({
      method: 'GET',
      url: `/orders/${orderId}/totals`,
      headers: { cookie },
    });
    await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/payments`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: {
        paymentMethodId: cashMethodId,
        amount: (totals.json() as { total: string }).total,
      },
    });

    const closeResponse = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/close`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(closeResponse.statusCode).toBe(204);

    const updateResponse = await app.inject({
      method: 'PATCH',
      url: `/orders/${orderId}/lines/${lineId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { quantity: 2 },
    });
    expect(updateResponse.statusCode).toBe(409);
    expect((updateResponse.json() as { error: string }).error).toBe('order_closed');

    const voidResponse = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines/${lineId}/void`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: {},
    });
    expect(voidResponse.statusCode).toBe(409);
    expect((voidResponse.json() as { error: string }).error).toBe('order_closed');
  });
});
