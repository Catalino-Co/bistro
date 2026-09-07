import { db, schema } from '@bistro/db';
import { and, eq } from 'drizzle-orm';

export interface OrderRow {
  id: number;
  branchId: number;
  dineTableId: number;
  status: 'open' | 'closed';
}

export type OpenOrderResult =
  | { outcome: 'opened'; order: OrderRow }
  | { outcome: 'table_not_found' }
  | { outcome: 'table_occupied' };

// Opening an order and occupying its table must happen atomically -- a
// failure between the two steps would otherwise leave a table marked
// available with an open order already sitting on it (or the reverse).
export async function openOrder(branchId: number, dineTableId: number): Promise<OpenOrderResult> {
  return db.transaction(async (tx) => {
    const [table] = await tx
      .select({ id: schema.dineTables.id, status: schema.dineTables.status })
      .from(schema.dineTables)
      .innerJoin(schema.dineAreas, eq(schema.dineTables.dineAreaId, schema.dineAreas.id))
      .where(and(eq(schema.dineTables.id, dineTableId), eq(schema.dineAreas.branchId, branchId)))
      .for('update');

    if (!table) {
      return { outcome: 'table_not_found' };
    }
    if (table.status !== 'available') {
      return { outcome: 'table_occupied' };
    }

    const [order] = await tx
      .insert(schema.orders)
      .values({ branchId, dineTableId, status: 'open' })
      .returning();
    if (!order) throw new Error('Failed to open order');

    await tx
      .update(schema.dineTables)
      .set({ status: 'occupied' })
      .where(eq(schema.dineTables.id, dineTableId));

    return { outcome: 'opened', order };
  });
}

export type CloseOrderResult =
  { outcome: 'closed' } | { outcome: 'not_found' } | { outcome: 'already_closed' };

// Closing (billing) an order frees its table in the same transaction --
// the legacy system's two uncoordinated lock mechanisms are what B0-13's
// order_locks note and this table both replace with a single source of
// truth for "is this table in use".
export async function closeOrder(branchId: number, orderId: number): Promise<CloseOrderResult> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select({
        id: schema.orders.id,
        dineTableId: schema.orders.dineTableId,
        status: schema.orders.status,
      })
      .from(schema.orders)
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.branchId, branchId)))
      .for('update');

    if (!order) {
      return { outcome: 'not_found' };
    }
    if (order.status === 'closed') {
      return { outcome: 'already_closed' };
    }

    await tx
      .update(schema.orders)
      .set({ status: 'closed', closedAt: new Date() })
      .where(eq(schema.orders.id, orderId));

    await tx
      .update(schema.dineTables)
      .set({ status: 'available' })
      .where(eq(schema.dineTables.id, order.dineTableId));

    return { outcome: 'closed' };
  });
}
