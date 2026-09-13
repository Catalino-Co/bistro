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
import { findTaxRateIdByName } from '../catalog/catalog.test-helpers.repo.js';
import { createDineArea, createDineTable } from '../floor/floor.repo.js';
import { findPaymentMethodIdByName } from '../payments/payments.test-helpers.repo.js';
import {
  createCatalogItem,
  deleteCatalogFixtures,
  type CatalogItemFixture,
} from './orders.totals.test-helpers.repo.js';

const USERNAME = '__bill_print_test_user__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';

describe('printing the customer bill', () => {
  const app = buildApp();
  let branch: BranchFixture;
  let cookie: string;
  let csrfToken: string;
  let item: CatalogItemFixture;
  let tableId: number;
  let orderId: number;
  let cashMethodId: number;

  // Impresora de mentira: acepta la conexión, guarda los bytes y cierra,
  // que es exactamente lo que hace una ESC/POS de red.
  let server: net.Server | undefined;
  let printerPort = 0;
  let received: Buffer[] = [];

  function lastPrintout(): string {
    return Buffer.concat(received).toString('latin1');
  }

  beforeAll(async () => {
    printerPort = await new Promise<number>((resolve) => {
      server = net.createServer((socket) => {
        socket.on('data', (chunk) => received.push(chunk));
        socket.on('end', () => socket.end());
      });
      server.listen(0, '127.0.0.1', () => resolve((server!.address() as net.AddressInfo).port));
    });

    const userId = await createTestUser(USERNAME, PASSWORD);
    branch = await createBranchFixture('bill-print');
    await assignRole(userId, 'admin', branch.branchId);

    cashMethodId = await findPaymentMethodIdByName('Efectivo');
    item = await createCatalogItem('bill', await findTaxRateIdByName('ITBIS 18%'));

    const area = await createDineArea(branch.branchId, '__bill_print_test_area__');
    tableId = (await createDineTable(area.id, '__bill_print_test_table__', 4)).id;

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
    // 2 x 10.00 -> 20.00 + 3.60 de ITBIS = 23.60
    await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/lines`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { itemId: item.itemId, quantity: 2 },
    });
  });

  afterAll(async () => {
    await deleteBranchFixture(branch);
    await deleteCatalogFixtures([item]);
    await deleteTestUser(USERNAME);
    await app.close();
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await closeTestDbPool();
  });

  async function printBill() {
    received = [];
    const response = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/print-bill`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    // Un respiro para que la impresora de mentira reciba y cierre.
    await new Promise((resolve) => setTimeout(resolve, 60));
    return response;
  }

  it('refuses to print when the branch has no receipt printer', async () => {
    const response = await printBill();
    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: string }).error).toBe('no_receipt_printer');
  });

  it('rejects a printer address without its port', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/org/branches/${branch.branchId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { receiptPrinterHost: '127.0.0.1' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('prints the pre-bill of an open order, with its live total', async () => {
    const configured = await app.inject({
      method: 'PATCH',
      url: `/org/branches/${branch.branchId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { receiptPrinterHost: '127.0.0.1', receiptPrinterPort: printerPort },
    });
    expect(configured.statusCode).toBe(204);

    const response = await printBill();
    expect(response.statusCode).toBe(200);
    // La primera impresión no es una reimpresión.
    expect((response.json() as { reprintNumber: number }).reprintNumber).toBe(0);

    const paper = lastPrintout();
    expect(paper).toContain(`Orden #${orderId}`);
    expect(paper).toContain('__bill_print_test_table__');
    expect(paper).toMatch(/TOTAL\s+23\.60/);
    expect(paper).not.toContain('REIMPRESION');
    // Todavía no se ha cobrado: no hay bloque de pagos.
    expect(paper).not.toContain('Efectivo');
    expect(paper).toContain('comprobante fiscal con NCF');
  });

  it('numbers every reprint on the paper', async () => {
    const second = await printBill();
    expect((second.json() as { reprintNumber: number }).reprintNumber).toBe(1);
    expect(lastPrintout()).toContain('** REIMPRESION #1 **');

    const third = await printBill();
    expect((third.json() as { reprintNumber: number }).reprintNumber).toBe(2);
    expect(lastPrintout()).toContain('** REIMPRESION #2 **');
  });

  it('leaves every print in the audit trail', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/audit?actionKey=order.bill_printed&limit=200`,
      headers: { cookie },
    });
    const { entries } = response.json() as {
      entries: { entityId: string | null; afterData: Record<string, unknown> | null }[];
    };
    const mine = entries.filter((entry) => entry.entityId === String(orderId));
    // Las tres que llegaron a la impresora. El rechazo por no haber
    // impresora configurada no se audita: no hubo intento de imprimir nada,
    // fue un error de configuración antes de tocar el socket.
    expect(mine.length).toBe(3);
    expect(mine[0]?.afterData).toMatchObject({ printed: true, reprintNumber: 2 });
  });

  it('prints the closed bill with what was actually charged', async () => {
    await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/payments`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { paymentMethodId: cashMethodId, amount: '23.60', tipAmount: '5.00' },
    });
    const closed = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/close`,
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(closed.statusCode).toBe(204);

    await printBill();
    const paper = lastPrintout();
    expect(paper).toContain('Cerrada:');
    expect(paper).toMatch(/Efectivo\s+23\.60/);
    expect(paper).toMatch(/Propina\s+5\.00/);
    expect(paper).toMatch(/TOTAL\s+23\.60/);
  });

  it('404s for an order of another branch', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/orders/99999999/print-bill',
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    expect(response.statusCode).toBe(404);
  });
});
