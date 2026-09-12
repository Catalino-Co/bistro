import { schema, type Database } from '@bistro/db';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { calculateOrderTotals, type OrderTotals } from './totals.js';

// db.transaction's callback param -- a PgTransaction, not a Database, so it
// lacks Database's $client -- but every query method used below exists on
// both, so a function taking either can run inside or outside a tx. Shared
// (not just an orders.repo.ts internal) because payments.repo.ts also needs
// to read the live total, from inside its own transaction, to validate a
// payment against the current balance due.
export type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

// Active (non-voided) lines only, each with its own item's tax rate --
// reused by closeOrder (to freeze the snapshot), getOrderTotals (to preview
// it live while the order is still open), and payments.repo.ts (to know the
// balance due). Takes the transaction executor when called from inside one,
// so it reads the same locked-and-uncommitted state the caller is about to
// act on.
export interface OrderLiveSummary extends OrderTotals {
  /** Líneas activas (no anuladas). */
  lineCount: number;
  /** De esas, las que todavía no se enviaron a cocina. */
  pendingToSend: number;
}

/**
 * Lo mismo que computeOrderTotals pero para muchas órdenes de golpe, en
 * dos consultas fijas en vez de dos por orden.
 *
 * Existe porque el mapa de mesas y el historial pintan decenas de órdenes
 * a la vez y se refrescan solos; ir orden por orden era una consulta por
 * fila. El cálculo sigue pasando por `calculateOrderTotals`, la misma
 * función pura que congela el total al cerrar, así que ninguna de esas dos
 * pantallas puede mostrar un número distinto del que se cobra.
 */
export async function summarizeOrders(
  executor: Executor,
  orderIds: number[],
): Promise<Map<number, OrderLiveSummary>> {
  const summaries = new Map<number, OrderLiveSummary>();
  if (orderIds.length === 0) {
    return summaries;
  }

  const lineRows = await executor
    .select({
      id: schema.orderLines.id,
      orderId: schema.orderLines.orderId,
      quantity: schema.orderLines.quantity,
      unitPrice: schema.orderLines.unitPrice,
      sentToKitchenAt: schema.orderLines.sentToKitchenAt,
      taxRate: schema.taxRates.rate,
    })
    .from(schema.orderLines)
    .innerJoin(schema.items, eq(schema.items.id, schema.orderLines.itemId))
    .innerJoin(schema.taxRates, eq(schema.taxRates.id, schema.items.taxRateId))
    .where(and(inArray(schema.orderLines.orderId, orderIds), isNull(schema.orderLines.voidedAt)));

  const lineIds = lineRows.map((row) => row.id);
  const modifierDeltasByLine = new Map<number, number[]>();
  if (lineIds.length > 0) {
    const modifierRows = await executor
      .select({
        orderLineId: schema.orderLineModifiers.orderLineId,
        priceDelta: schema.orderLineModifiers.priceDelta,
      })
      .from(schema.orderLineModifiers)
      .where(inArray(schema.orderLineModifiers.orderLineId, lineIds));
    for (const row of modifierRows) {
      const existing = modifierDeltasByLine.get(row.orderLineId) ?? [];
      existing.push(Number(row.priceDelta));
      modifierDeltasByLine.set(row.orderLineId, existing);
    }
  }

  const linesByOrder = new Map<number, typeof lineRows>();
  for (const row of lineRows) {
    const existing = linesByOrder.get(row.orderId) ?? [];
    existing.push(row);
    linesByOrder.set(row.orderId, existing);
  }

  for (const orderId of orderIds) {
    const lines = linesByOrder.get(orderId) ?? [];
    const totals = calculateOrderTotals(
      lines.map((line) => ({
        unitPrice: Number(line.unitPrice),
        quantity: line.quantity,
        modifierPriceDeltas: modifierDeltasByLine.get(line.id) ?? [],
        taxRate: Number(line.taxRate),
      })),
    );
    summaries.set(orderId, {
      ...totals,
      lineCount: lines.length,
      pendingToSend: lines.filter((line) => line.sentToKitchenAt === null).length,
    });
  }

  return summaries;
}

export async function computeOrderTotals(
  executor: Executor,
  orderId: number,
): Promise<OrderTotals> {
  const rows = await executor
    .select({
      id: schema.orderLines.id,
      quantity: schema.orderLines.quantity,
      unitPrice: schema.orderLines.unitPrice,
      taxRate: schema.taxRates.rate,
    })
    .from(schema.orderLines)
    .innerJoin(schema.items, eq(schema.items.id, schema.orderLines.itemId))
    .innerJoin(schema.taxRates, eq(schema.taxRates.id, schema.items.taxRateId))
    .where(and(eq(schema.orderLines.orderId, orderId), isNull(schema.orderLines.voidedAt)));

  const lineIds = rows.map((r) => r.id);
  const modifierDeltasByLine = new Map<number, number[]>();
  if (lineIds.length > 0) {
    const modifierRows = await executor
      .select({
        orderLineId: schema.orderLineModifiers.orderLineId,
        priceDelta: schema.orderLineModifiers.priceDelta,
      })
      .from(schema.orderLineModifiers)
      .where(inArray(schema.orderLineModifiers.orderLineId, lineIds));
    for (const row of modifierRows) {
      const existing = modifierDeltasByLine.get(row.orderLineId) ?? [];
      existing.push(Number(row.priceDelta));
      modifierDeltasByLine.set(row.orderLineId, existing);
    }
  }

  return calculateOrderTotals(
    rows.map((row) => ({
      unitPrice: Number(row.unitPrice),
      quantity: row.quantity,
      modifierPriceDeltas: modifierDeltasByLine.get(row.id) ?? [],
      taxRate: Number(row.taxRate),
    })),
  );
}
