import { db, schema } from '@bistro/db';
import { and, eq, inArray } from 'drizzle-orm';
import { recordAuditEvent } from '../audit/audit.repo.js';

export type DispatchMode = 'dine_in' | 'delivery' | 'pickup' | 'room_service';

export interface OrderRow {
  id: number;
  branchId: number;
  dineTableId: number;
  status: 'open' | 'closed';
  dispatchMode: DispatchMode;
  customerId: number | null;
}

export type OpenOrderResult =
  | { outcome: 'opened'; order: OrderRow }
  | { outcome: 'table_not_found' }
  | { outcome: 'table_occupied' }
  | { outcome: 'room_service_not_allowed' };

// The trigger in migration 0011 raises this SQLSTATE (23514, "check
// violation") when a room_service order's customer doesn't exist or its
// type doesn't allow room service -- a client bypassing the API entirely
// (or a future caller of openOrder that forgets to validate) still can't
// slip an invalid order past the DB.
function isCheckViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23514'
  );
}

// Lets the floor UI resolve "this table is occupied" back to the order id
// it needs to link to, without keeping that mapping in client-side state.
export async function findOpenOrderForTable(
  branchId: number,
  dineTableId: number,
): Promise<OrderRow | null> {
  const [order] = await db
    .select({
      id: schema.orders.id,
      branchId: schema.orders.branchId,
      dineTableId: schema.orders.dineTableId,
      status: schema.orders.status,
      dispatchMode: schema.orders.dispatchMode,
      customerId: schema.orders.customerId,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.branchId, branchId),
        eq(schema.orders.dineTableId, dineTableId),
        eq(schema.orders.status, 'open'),
      ),
    );
  return order ?? null;
}

// Opening an order and occupying its table must happen atomically -- a
// failure between the two steps would otherwise leave a table marked
// available with an open order already sitting on it (or the reverse).
export async function openOrder(
  branchId: number,
  dineTableId: number,
  dispatchMode: DispatchMode = 'dine_in',
  customerId?: number,
): Promise<OpenOrderResult> {
  try {
    return await db.transaction(async (tx) => {
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
        .values({
          branchId,
          dineTableId,
          status: 'open',
          dispatchMode,
          customerId: customerId ?? null,
        })
        .returning();
      if (!order) throw new Error('Failed to open order');

      await tx
        .update(schema.dineTables)
        .set({ status: 'occupied' })
        .where(eq(schema.dineTables.id, dineTableId));

      return { outcome: 'opened', order };
    });
  } catch (error) {
    if (isCheckViolation(error)) {
      return { outcome: 'room_service_not_allowed' };
    }
    throw error;
  }
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

export interface OrderLineModifierRow {
  modifierId: number;
  name: string;
  priceDelta: string;
}

export interface OrderLineRow {
  id: number;
  orderId: number;
  itemId: number;
  quantity: number;
  note: string | null;
  unitPrice: string;
  voidedAt: Date | null;
  modifiers: OrderLineModifierRow[];
}

export type AddOrderLineResult =
  | { outcome: 'added'; line: OrderLineRow }
  | { outcome: 'order_not_found' }
  | { outcome: 'order_closed' }
  | { outcome: 'item_not_found' }
  | { outcome: 'modifier_not_allowed' };

// A line's note is per-line by construction (order_lines.note, one column
// per row) -- the legacy printed a single note for the whole comanda, so
// two lines of the same item could never carry different instructions.
export async function addOrderLine(
  branchId: number,
  orderId: number,
  itemId: number,
  quantity: number,
  note: string | undefined,
  modifierIds: number[],
): Promise<AddOrderLineResult> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select({ status: schema.orders.status })
      .from(schema.orders)
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.branchId, branchId)));
    if (!order) {
      return { outcome: 'order_not_found' };
    }
    if (order.status === 'closed') {
      return { outcome: 'order_closed' };
    }

    const [item] = await tx
      .select({ id: schema.items.id, price: schema.items.price })
      .from(schema.items)
      .where(eq(schema.items.id, itemId));
    if (!item) {
      return { outcome: 'item_not_found' };
    }

    const distinctModifierIds = [...new Set(modifierIds)];
    let modifierRows: { id: number; name: string; priceDelta: string }[] = [];
    if (distinctModifierIds.length > 0) {
      modifierRows = await tx
        .select({
          id: schema.modifiers.id,
          name: schema.modifiers.name,
          priceDelta: schema.modifiers.priceDelta,
        })
        .from(schema.modifiers)
        .innerJoin(
          schema.itemModifierGroups,
          eq(schema.itemModifierGroups.modifierGroupId, schema.modifiers.groupId),
        )
        .where(
          and(
            eq(schema.itemModifierGroups.itemId, itemId),
            inArray(schema.modifiers.id, distinctModifierIds),
          ),
        );
      // Every requested modifier must both exist and belong to a group
      // associated with this item -- otherwise a client could charge an
      // unrelated modifier (or a nonexistent one) onto the line.
      if (modifierRows.length !== distinctModifierIds.length) {
        return { outcome: 'modifier_not_allowed' };
      }
    }

    const [line] = await tx
      .insert(schema.orderLines)
      .values({ orderId, itemId, quantity, note: note ?? null, unitPrice: item.price })
      .returning();
    if (!line) throw new Error('Failed to add order line');

    if (modifierRows.length > 0) {
      await tx.insert(schema.orderLineModifiers).values(
        modifierRows.map((m) => ({
          orderLineId: line.id,
          modifierId: m.id,
          priceDelta: m.priceDelta,
        })),
      );
    }

    return {
      outcome: 'added',
      line: {
        id: line.id,
        orderId: line.orderId,
        itemId: line.itemId,
        quantity: line.quantity,
        note: line.note,
        unitPrice: line.unitPrice,
        voidedAt: line.voidedAt,
        modifiers: modifierRows.map((m) => ({
          modifierId: m.id,
          name: m.name,
          priceDelta: m.priceDelta,
        })),
      },
    };
  });
}

export async function listOrderLines(branchId: number, orderId: number): Promise<OrderLineRow[]> {
  const [order] = await db
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.branchId, branchId)));
  if (!order) {
    return [];
  }

  const lines = await db
    .select({
      id: schema.orderLines.id,
      orderId: schema.orderLines.orderId,
      itemId: schema.orderLines.itemId,
      quantity: schema.orderLines.quantity,
      note: schema.orderLines.note,
      unitPrice: schema.orderLines.unitPrice,
      voidedAt: schema.orderLines.voidedAt,
    })
    .from(schema.orderLines)
    .where(eq(schema.orderLines.orderId, orderId));

  const lineIds = lines.map((l) => l.id);
  const modifiersByLine = new Map<number, OrderLineModifierRow[]>();
  if (lineIds.length > 0) {
    const modifierRows = await db
      .select({
        orderLineId: schema.orderLineModifiers.orderLineId,
        modifierId: schema.orderLineModifiers.modifierId,
        name: schema.modifiers.name,
        priceDelta: schema.orderLineModifiers.priceDelta,
      })
      .from(schema.orderLineModifiers)
      .innerJoin(schema.modifiers, eq(schema.modifiers.id, schema.orderLineModifiers.modifierId))
      .where(inArray(schema.orderLineModifiers.orderLineId, lineIds));
    for (const row of modifierRows) {
      const existing = modifiersByLine.get(row.orderLineId) ?? [];
      existing.push({ modifierId: row.modifierId, name: row.name, priceDelta: row.priceDelta });
      modifiersByLine.set(row.orderLineId, existing);
    }
  }

  return lines.map((line) => ({ ...line, modifiers: modifiersByLine.get(line.id) ?? [] }));
}

export type UpdateOrderLineResult =
  | { outcome: 'updated'; line: OrderLineRow }
  | { outcome: 'order_not_found' }
  | { outcome: 'order_closed' }
  | { outcome: 'line_not_found' }
  | { outcome: 'line_voided' }
  | { outcome: 'modifier_not_allowed' };

type UpdateOrderLineTxResult =
  | { outcome: 'updated'; before: { quantity: number; note: string | null }; line: OrderLineRow }
  | { outcome: 'order_not_found' }
  | { outcome: 'order_closed' }
  | { outcome: 'line_not_found' }
  | { outcome: 'line_voided' }
  | { outcome: 'modifier_not_allowed' };

// Full replace of quantity/note/modifiers, not a partial patch -- same
// choice floor.repo.ts's updateDineTable makes. Modifiers are revalidated
// against the line's item exactly like addOrderLine does, and priceDelta is
// re-snapshotted from the modifier's current price (this is a correction to
// an unbilled line, not a historical record yet).
export async function updateOrderLine(
  branchId: number,
  orderId: number,
  lineId: number,
  quantity: number,
  note: string | undefined,
  modifierIds: number[],
  actorUserId?: number,
): Promise<UpdateOrderLineResult> {
  const result: UpdateOrderLineTxResult = await db.transaction(async (tx) => {
    const [order] = await tx
      .select({ status: schema.orders.status })
      .from(schema.orders)
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.branchId, branchId)));
    if (!order) {
      return { outcome: 'order_not_found' };
    }
    if (order.status === 'closed') {
      return { outcome: 'order_closed' };
    }

    const [line] = await tx
      .select({
        id: schema.orderLines.id,
        orderId: schema.orderLines.orderId,
        itemId: schema.orderLines.itemId,
        quantity: schema.orderLines.quantity,
        note: schema.orderLines.note,
        unitPrice: schema.orderLines.unitPrice,
        voidedAt: schema.orderLines.voidedAt,
      })
      .from(schema.orderLines)
      .where(and(eq(schema.orderLines.id, lineId), eq(schema.orderLines.orderId, orderId)))
      .for('update');
    if (!line) {
      return { outcome: 'line_not_found' };
    }
    if (line.voidedAt !== null) {
      return { outcome: 'line_voided' };
    }

    const distinctModifierIds = [...new Set(modifierIds)];
    let modifierRows: { id: number; name: string; priceDelta: string }[] = [];
    if (distinctModifierIds.length > 0) {
      modifierRows = await tx
        .select({
          id: schema.modifiers.id,
          name: schema.modifiers.name,
          priceDelta: schema.modifiers.priceDelta,
        })
        .from(schema.modifiers)
        .innerJoin(
          schema.itemModifierGroups,
          eq(schema.itemModifierGroups.modifierGroupId, schema.modifiers.groupId),
        )
        .where(
          and(
            eq(schema.itemModifierGroups.itemId, line.itemId),
            inArray(schema.modifiers.id, distinctModifierIds),
          ),
        );
      if (modifierRows.length !== distinctModifierIds.length) {
        return { outcome: 'modifier_not_allowed' };
      }
    }

    const before = { quantity: line.quantity, note: line.note };
    const nextNote = note ?? null;

    await tx
      .update(schema.orderLines)
      .set({ quantity, note: nextNote })
      .where(eq(schema.orderLines.id, lineId));

    await tx
      .delete(schema.orderLineModifiers)
      .where(eq(schema.orderLineModifiers.orderLineId, lineId));
    if (modifierRows.length > 0) {
      await tx.insert(schema.orderLineModifiers).values(
        modifierRows.map((m) => ({
          orderLineId: lineId,
          modifierId: m.id,
          priceDelta: m.priceDelta,
        })),
      );
    }

    return {
      outcome: 'updated',
      before,
      line: {
        id: line.id,
        orderId: line.orderId,
        itemId: line.itemId,
        quantity,
        note: nextNote,
        unitPrice: line.unitPrice,
        voidedAt: line.voidedAt,
        modifiers: modifierRows.map((m) => ({
          modifierId: m.id,
          name: m.name,
          priceDelta: m.priceDelta,
        })),
      },
    };
  });

  if (result.outcome === 'updated') {
    await recordAuditEvent({
      actionKey: 'order_line.updated',
      entityType: 'order_line',
      entityId: String(lineId),
      branchId,
      userId: actorUserId,
      beforeData: result.before,
      afterData: {
        quantity: result.line.quantity,
        note: result.line.note,
        modifierIds: result.line.modifiers.map((m) => m.modifierId),
      },
    });
    return { outcome: 'updated', line: result.line };
  }
  return result;
}

export type VoidOrderLineResult =
  | { outcome: 'voided'; line: OrderLineRow }
  | { outcome: 'order_not_found' }
  | { outcome: 'order_closed' }
  | { outcome: 'line_not_found' }
  | { outcome: 'already_voided' };

// Soft-cancel: the line stays on the order (voided_at set) instead of being
// deleted, so it still shows up -- struck through -- in what was ordered.
export async function voidOrderLine(
  branchId: number,
  orderId: number,
  lineId: number,
  reason: string | undefined,
  actorUserId?: number,
): Promise<VoidOrderLineResult> {
  const result: VoidOrderLineResult = await db.transaction(async (tx) => {
    const [order] = await tx
      .select({ status: schema.orders.status })
      .from(schema.orders)
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.branchId, branchId)));
    if (!order) {
      return { outcome: 'order_not_found' };
    }
    if (order.status === 'closed') {
      return { outcome: 'order_closed' };
    }

    const [line] = await tx
      .select({
        id: schema.orderLines.id,
        orderId: schema.orderLines.orderId,
        itemId: schema.orderLines.itemId,
        quantity: schema.orderLines.quantity,
        note: schema.orderLines.note,
        unitPrice: schema.orderLines.unitPrice,
        voidedAt: schema.orderLines.voidedAt,
      })
      .from(schema.orderLines)
      .where(and(eq(schema.orderLines.id, lineId), eq(schema.orderLines.orderId, orderId)))
      .for('update');
    if (!line) {
      return { outcome: 'line_not_found' };
    }
    if (line.voidedAt !== null) {
      return { outcome: 'already_voided' };
    }

    const voidedAt = new Date();
    await tx.update(schema.orderLines).set({ voidedAt }).where(eq(schema.orderLines.id, lineId));

    const modifierRows = await tx
      .select({
        modifierId: schema.orderLineModifiers.modifierId,
        name: schema.modifiers.name,
        priceDelta: schema.orderLineModifiers.priceDelta,
      })
      .from(schema.orderLineModifiers)
      .innerJoin(schema.modifiers, eq(schema.modifiers.id, schema.orderLineModifiers.modifierId))
      .where(eq(schema.orderLineModifiers.orderLineId, lineId));

    return {
      outcome: 'voided',
      line: {
        id: line.id,
        orderId: line.orderId,
        itemId: line.itemId,
        quantity: line.quantity,
        note: line.note,
        unitPrice: line.unitPrice,
        voidedAt,
        modifiers: modifierRows,
      },
    };
  });

  if (result.outcome === 'voided') {
    await recordAuditEvent({
      actionKey: 'order_line.voided',
      entityType: 'order_line',
      entityId: String(lineId),
      branchId,
      userId: actorUserId,
      beforeData: { voidedAt: null },
      afterData: { voidedAt: result.line.voidedAt?.toISOString(), reason },
    });
  }
  return result;
}
