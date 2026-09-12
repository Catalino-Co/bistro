import net from 'node:net';
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
import { createKitchenStation } from '../catalog/catalog.repo.js';
import { deleteKitchenStation, findTaxRateIdByName } from '../catalog/catalog.test-helpers.repo.js';
import { createDineArea, createDineTable } from '../floor/floor.repo.js';
import {
  createCatalogItem,
  deleteCatalogFixtures,
  type CatalogItemFixture,
} from './orders.totals.test-helpers.repo.js';

const USERNAME = '__orders_kitchen_test_user__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';

interface SentLine {
  id: number;
  itemId: number;
  stationId: number | null;
}

interface PrintResult {
  stationId: number;
  outcome: string;
}

describe('send order lines to the kitchen', () => {
  const app = buildApp();
  let branch: BranchFixture;
  let cookie: string;
  let csrfToken: string;
  let stationId: number;
  let routedItem: CatalogItemFixture;
  let unroutedItem: CatalogItemFixture;
  let orderId: number;

  beforeAll(async () => {
    const userId = await createTestUser(USERNAME, PASSWORD);
    branch = await createBranchFixture('orders-kitchen');
    await assignRole(userId, 'admin', branch.branchId);

    stationId = (await createKitchenStation('__orders_kitchen_test_station__')).id;
    const taxRateId = await findTaxRateIdByName('ITBIS 18%');
    routedItem = await createCatalogItem('kitchen-routed', taxRateId);
    unroutedItem = await createCatalogItem('kitchen-unrouted', taxRateId);

    const dineAreaId = (await createDineArea(branch.branchId, '__orders_kitchen_test_area__')).id;
    const table = await createDineTable(dineAreaId, '__orders_kitchen_test_table__', 4);

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

    await app.inject({
      method: 'PATCH',
      url: `/catalog/items/${routedItem.itemId}/station`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { stationId },
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
    await deleteCatalogFixtures([routedItem, unroutedItem]);
    await deleteKitchenStation(stationId);
    await deleteTestUser(USERNAME);
    await app.close();
    await closeTestDbPool();
  });

  it('marks pending lines sent, including one whose item has no station', async () => {
    const routedLine = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId: routedItem.itemId, quantity: 1 },
    });
    const routedLineId = (routedLine.json() as { line: { id: number } }).line.id;

    const unroutedLine = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId: unroutedItem.itemId, quantity: 1 },
    });
    const unroutedLineId = (unroutedLine.json() as { line: { id: number } }).line.id;

    const send = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/send-to-kitchen`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(send.statusCode).toBe(200);
    const sentById = new Map(
      (send.json() as { lines: SentLine[] }).lines.map((l) => [l.id, l.stationId]),
    );
    expect(sentById.get(routedLineId)).toBe(stationId);
    expect(sentById.get(unroutedLineId)).toBeNull();

    // The routed item's station has no printer configured yet -- printing
    // is attempted but reported as skipped, not silently omitted.
    const printResults = (send.json() as { printResults: PrintResult[] }).printResults;
    expect(printResults).toEqual([
      { stationId, stationName: expect.any(String), outcome: 'no_printer_configured' },
    ]);

    const lines = await app.inject({
      method: 'GET',
      url: `/orders/${orderId}/lines`,
      headers: { cookie },
    });
    const sentAtById = new Map(
      (lines.json() as { lines: { id: number; sentToKitchenAt: string | null }[] }).lines.map(
        (l) => [l.id, l.sentToKitchenAt],
      ),
    );
    expect(sentAtById.get(routedLineId)).not.toBeNull();
    expect(sentAtById.get(unroutedLineId)).not.toBeNull();
  });

  it('does not re-send already-sent lines, and skips a voided one', async () => {
    const secondSend = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/send-to-kitchen`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect((secondSend.json() as { lines: SentLine[] }).lines).toEqual([]);

    const newLine = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId: routedItem.itemId, quantity: 1 },
    });
    const newLineId = (newLine.json() as { line: { id: number } }).line.id;
    await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines/${newLineId}/void`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });

    const send = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/send-to-kitchen`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect((send.json() as { lines: SentLine[] }).lines).toEqual([]);
  });

  it('prints an actual ticket to the station printer when one is configured', async () => {
    const received: Buffer[] = [];
    const server = net.createServer((socket) => {
      socket.on('data', (chunk) => received.push(chunk));
      socket.on('end', () => socket.end());
    });
    const port = await new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve((server.address() as net.AddressInfo).port));
    });

    try {
      const configured = await app.inject({
        method: 'PATCH',
        url: `/catalog/kitchen-stations/${stationId}/printer`,
        headers: { cookie, 'x-csrf-token': csrfToken },
        payload: { printerHost: '127.0.0.1', printerPort: port },
      });
      expect(configured.statusCode).toBe(204);

      await app.inject({
        method: 'POST',
        url: `/orders/${orderId}/lines`,
        headers: { cookie, 'x-csrf-token': csrfToken },
        payload: { itemId: routedItem.itemId, quantity: 2, note: 'bien caliente' },
      });

      const send = await app.inject({
        method: 'POST',
        url: `/orders/${orderId}/send-to-kitchen`,
        headers: { cookie, 'x-csrf-token': csrfToken },
      });
      expect(send.statusCode).toBe(200);
      const printResults = (send.json() as { printResults: PrintResult[] }).printResults;
      expect(printResults).toEqual([
        { stationId, stationName: expect.any(String), outcome: 'printed' },
      ]);

      // Give the server's 'data'/'end' handlers a tick to run after the
      // route's own await on sendToPrinter already confirmed delivery.
      await new Promise((resolve) => setTimeout(resolve, 50));
      const ticketText = Buffer.concat(received).toString('latin1');
      expect(ticketText).toContain('Orden #' + orderId);
      expect(ticketText).toContain('2x');
      expect(ticketText).toContain('bien caliente');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await app.inject({
        method: 'PATCH',
        url: `/catalog/kitchen-stations/${stationId}/printer`,
        headers: { cookie, 'x-csrf-token': csrfToken },
        payload: { printerHost: null, printerPort: null },
      });
    }
  });

  it('rejects sending for an order that does not exist', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/orders/999999999/send-to-kitchen',
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(response.statusCode).toBe(404);
    expect((response.json() as { error: string }).error).toBe('order_not_found');
  });
});
