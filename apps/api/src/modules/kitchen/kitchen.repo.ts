import { db, schema } from '@bistro/db';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';

export interface KitchenTicketLine {
  id: number;
  orderId: number;
  dineTableName: string;
  itemName: string;
  quantity: number;
  note: string | null;
  sentToKitchenAt: Date | null;
}

// Branch-scoped (via a join to orders) the same way every other kitchen/
// order query in this codebase is -- kitchen.manage is a per-branch
// permission just like orders.manage, so a station's ticket view should
// never leak lines from another branch.
export async function listStationTickets(
  branchId: number,
  stationId: number,
): Promise<KitchenTicketLine[]> {
  return db
    .select({
      id: schema.orderLines.id,
      orderId: schema.orderLines.orderId,
      dineTableName: schema.dineTables.name,
      itemName: schema.items.name,
      quantity: schema.orderLines.quantity,
      note: schema.orderLines.note,
      sentToKitchenAt: schema.orderLines.sentToKitchenAt,
    })
    .from(schema.orderLines)
    .innerJoin(schema.items, eq(schema.items.id, schema.orderLines.itemId))
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderLines.orderId))
    .innerJoin(schema.dineTables, eq(schema.dineTables.id, schema.orders.dineTableId))
    .where(
      and(
        eq(schema.orders.branchId, branchId),
        eq(schema.items.stationId, stationId),
        isNotNull(schema.orderLines.sentToKitchenAt),
        isNull(schema.orderLines.preparedAt),
        isNull(schema.orderLines.voidedAt),
      ),
    )
    .orderBy(schema.orderLines.sentToKitchenAt);
}

export type MarkPreparedResult =
  | { outcome: 'prepared' }
  | { outcome: 'line_not_found' }
  | { outcome: 'not_sent' }
  | { outcome: 'already_prepared' };

export async function markLinePrepared(
  branchId: number,
  lineId: number,
): Promise<MarkPreparedResult> {
  return db.transaction(async (tx) => {
    const [line] = await tx
      .select({
        sentToKitchenAt: schema.orderLines.sentToKitchenAt,
        preparedAt: schema.orderLines.preparedAt,
      })
      .from(schema.orderLines)
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderLines.orderId))
      .where(and(eq(schema.orderLines.id, lineId), eq(schema.orders.branchId, branchId)))
      .for('update');
    if (!line) {
      return { outcome: 'line_not_found' };
    }
    if (line.sentToKitchenAt === null) {
      return { outcome: 'not_sent' };
    }
    if (line.preparedAt !== null) {
      return { outcome: 'already_prepared' };
    }

    await tx
      .update(schema.orderLines)
      .set({ preparedAt: new Date() })
      .where(eq(schema.orderLines.id, lineId));
    return { outcome: 'prepared' };
  });
}
