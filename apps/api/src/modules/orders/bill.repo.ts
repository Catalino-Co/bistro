import { db, schema } from '@bistro/db';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { findAuditEvents, recordAuditEvent } from '../audit/audit.repo.js';
import { sendToPrinter } from '../kitchen/printer-client.js';
import { buildBillBytes, type BillLine, type BillPayment } from './bill.js';
import { computeOrderTotals } from './order-totals.repo.js';

export type PrintBillResult =
  | { outcome: 'printed'; reprintNumber: number }
  | { outcome: 'order_not_found' }
  | { outcome: 'no_printer' }
  | { outcome: 'print_failed'; error: string; reprintNumber: number };

const BILL_PRINTED = 'order.bill_printed';

/**
 * Imprime la cuenta de una orden en la impresora de caja de su sucursal.
 *
 * Funciona con la orden abierta (la pre-cuenta que se lleva a la mesa antes
 * de cobrar) y con la orden cerrada (la reimpresión). La diferencia está en
 * los totales: si ya se cobró, salen de las columnas congeladas; si sigue
 * abierta, se calculan en vivo. Es la misma regla del historial y del panel
 * del día -- un cambio de ITBIS no puede reescribir lo que se cobró.
 *
 * Cada impresión queda en la bitácora, y el papel dice en grande cuántas
 * reimpresiones van. Una cuenta que se imprime cinco veces es justo lo que
 * un dueño quiere poder notar.
 */
export async function printOrderBill(
  branchId: number,
  orderId: number,
  actorUserId: number,
): Promise<PrintBillResult> {
  const [order] = await db
    .select({
      id: schema.orders.id,
      status: schema.orders.status,
      openedAt: schema.orders.openedAt,
      closedAt: schema.orders.closedAt,
      subtotal: schema.orders.subtotal,
      taxTotal: schema.orders.taxTotal,
      total: schema.orders.total,
      dineTableName: schema.dineTables.name,
      customerName: schema.customers.name,
      branchName: schema.branches.name,
      timezone: schema.branches.timezone,
      printerHost: schema.branches.receiptPrinterHost,
      printerPort: schema.branches.receiptPrinterPort,
      companyName: schema.companies.name,
      taxId: schema.companies.taxId,
    })
    .from(schema.orders)
    .innerJoin(schema.dineTables, eq(schema.dineTables.id, schema.orders.dineTableId))
    .innerJoin(schema.branches, eq(schema.branches.id, schema.orders.branchId))
    .innerJoin(schema.businessUnits, eq(schema.businessUnits.id, schema.branches.businessUnitId))
    .innerJoin(schema.companies, eq(schema.companies.id, schema.businessUnits.companyId))
    .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.branchId, branchId)));

  if (!order) {
    return { outcome: 'order_not_found' };
  }
  if (!order.printerHost || order.printerPort === null) {
    return { outcome: 'no_printer' };
  }

  const lineRows = await db
    .select({
      id: schema.orderLines.id,
      itemName: schema.items.name,
      quantity: schema.orderLines.quantity,
      note: schema.orderLines.note,
      unitPrice: schema.orderLines.unitPrice,
    })
    .from(schema.orderLines)
    .innerJoin(schema.items, eq(schema.items.id, schema.orderLines.itemId))
    .where(and(eq(schema.orderLines.orderId, orderId), isNull(schema.orderLines.voidedAt)));

  const modifiersByLine = new Map<number, { name: string; priceDelta: number }[]>();
  const lineIds = lineRows.map((row) => row.id);
  if (lineIds.length > 0) {
    const modifierRows = await db
      .select({
        orderLineId: schema.orderLineModifiers.orderLineId,
        name: schema.modifiers.name,
        priceDelta: schema.orderLineModifiers.priceDelta,
      })
      .from(schema.orderLineModifiers)
      .innerJoin(schema.modifiers, eq(schema.modifiers.id, schema.orderLineModifiers.modifierId))
      .where(inArray(schema.orderLineModifiers.orderLineId, lineIds));
    for (const row of modifierRows) {
      const existing = modifiersByLine.get(row.orderLineId) ?? [];
      existing.push({ name: row.name, priceDelta: Number(row.priceDelta) });
      modifiersByLine.set(row.orderLineId, existing);
    }
  }

  const lines: BillLine[] = lineRows.map((row) => {
    const modifiers = modifiersByLine.get(row.id) ?? [];
    return {
      quantity: row.quantity,
      itemName: row.itemName,
      note: row.note,
      // El precio impreso incluye los modificadores, igual que el total:
      // una línea que en el papel no suma lo que dice es una discusión con
      // el cliente esperando a ocurrir.
      unitPrice:
        Number(row.unitPrice) + modifiers.reduce((sum, modifier) => sum + modifier.priceDelta, 0),
      modifiers,
    };
  });

  const totals =
    order.status === 'closed' && order.total !== null
      ? {
          subtotal: Number(order.subtotal ?? 0),
          taxTotal: Number(order.taxTotal ?? 0),
          total: Number(order.total),
        }
      : await computeOrderTotals(db, orderId);

  const paymentRows = await db
    .select({
      methodName: schema.paymentMethods.name,
      amount: schema.payments.amount,
      tipAmount: schema.payments.tipAmount,
    })
    .from(schema.payments)
    .innerJoin(schema.paymentMethods, eq(schema.paymentMethods.id, schema.payments.paymentMethodId))
    .where(eq(schema.payments.orderId, orderId));
  const payments: BillPayment[] = paymentRows.map((row) => ({
    methodName: row.methodName,
    amount: Number(row.amount),
    tipAmount: Number(row.tipAmount),
  }));

  // La bitácora ya sabe cuántas veces se imprimió: no hace falta una
  // columna contador que pueda quedar desincronizada del registro real.
  const previousPrints = await findAuditEvents(BILL_PRINTED, String(orderId));
  const reprintNumber = previousPrints.length;

  const bytes = buildBillBytes(
    {
      companyName: order.companyName,
      branchName: order.branchName,
      taxId: order.taxId,
      orderId: order.id,
      dineTableName: order.dineTableName,
      customerName: order.customerName,
      openedAt: order.openedAt,
      closedAt: order.closedAt,
      lines,
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
      payments,
      reprintNumber,
      printedAt: new Date(),
    },
    order.timezone,
  );

  const result = await sendToPrinter(order.printerHost, order.printerPort, bytes);

  // Se audita el intento, salga o no el papel: que la impresora estuviera
  // apagada también es información para quien revisa después.
  await recordAuditEvent({
    actionKey: BILL_PRINTED,
    entityType: 'order',
    entityId: String(orderId),
    afterData: {
      reprintNumber,
      total: totals.total.toFixed(4),
      status: order.status,
      printed: result.outcome === 'printed',
      ...(result.outcome === 'failed' && { error: result.error }),
    },
    userId: actorUserId,
    branchId,
  });

  if (result.outcome === 'failed') {
    return { outcome: 'print_failed', error: result.error, reprintNumber };
  }
  return { outcome: 'printed', reprintNumber };
}
