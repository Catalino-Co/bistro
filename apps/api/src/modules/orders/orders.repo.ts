import { db, schema } from '@bistro/db';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { recordAuditEvent } from '../audit/audit.repo.js';
import { isItemSellable } from '../catalog/catalog.repo.js';
import { printStationTickets, type PrintStationResult } from '../kitchen/kitchen.repo.js';
import { sumPaymentsAmount } from '../payments/payments.repo.js';
import { computeOrderTotals } from './order-totals.repo.js';

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

export interface OrderDetail extends OrderRow {
  dineTableName: string;
  customerName: string | null;
  openedAt: string;
  closedAt: string | null;
  // Congelados al cerrar; null mientras la orden sigue abierta, en cuyo
  // caso el total en vivo se pide a /orders/:id/totals.
  subtotal: string | null;
  taxTotal: string | null;
  total: string | null;
}

// The POS screen's own header (which table, which dispatch mode, which
// customer) -- dispatch mode and customer are fixed at open time (there's
// no route to change them once set), so this is read-only by design.
export async function getOrderDetail(
  branchId: number,
  orderId: number,
): Promise<OrderDetail | null> {
  const [row] = await db
    .select({
      id: schema.orders.id,
      branchId: schema.orders.branchId,
      dineTableId: schema.orders.dineTableId,
      status: schema.orders.status,
      dispatchMode: schema.orders.dispatchMode,
      customerId: schema.orders.customerId,
      dineTableName: schema.dineTables.name,
      customerName: schema.customers.name,
      openedAt: schema.orders.openedAt,
      closedAt: schema.orders.closedAt,
      subtotal: schema.orders.subtotal,
      taxTotal: schema.orders.taxTotal,
      total: schema.orders.total,
    })
    .from(schema.orders)
    .innerJoin(schema.dineTables, eq(schema.dineTables.id, schema.orders.dineTableId))
    .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.branchId, branchId)));
  return row
    ? {
        ...row,
        customerName: row.customerName ?? null,
        openedAt: row.openedAt.toISOString(),
        closedAt: row.closedAt?.toISOString() ?? null,
      }
    : null;
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
  | { outcome: 'closed' }
  | { outcome: 'not_found' }
  | { outcome: 'already_closed' }
  | { outcome: 'insufficient_payment'; balanceDue: string };

// Closing (billing) an order frees its table in the same transaction --
// the legacy system's two uncoordinated lock mechanisms are what B0-13's
// order_locks note and this table both replace with a single source of
// truth for "is this table in use". "Facturar" also has to mean the order
// was actually paid: closing is refused until recorded payments (which
// payments.repo.ts's addPayment already caps at the balance due, so this
// is really just a >= check) cover the live total.
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

    const totals = await computeOrderTotals(tx, orderId);
    const totalCents = Math.round(totals.total * 10000);
    const paidCents = Math.round((await sumPaymentsAmount(tx, orderId)) * 10000);
    if (paidCents < totalCents) {
      return {
        outcome: 'insufficient_payment',
        balanceDue: ((totalCents - paidCents) / 10000).toFixed(4),
      };
    }

    await tx
      .update(schema.orders)
      .set({
        status: 'closed',
        closedAt: new Date(),
        subtotal: totals.subtotal.toFixed(4),
        taxTotal: totals.taxTotal.toFixed(4),
        total: totals.total.toFixed(4),
      })
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
  sentToKitchenAt: Date | null;
  preparedAt: Date | null;
  modifiers: OrderLineModifierRow[];
}

// Lo que devuelve la lectura de una cuenta. El nombre del ítem viaja con
// la línea para que leerla no exija permiso de catálogo: un cajero tiene
// orders.manage, no catalog.manage, y aun así tiene que poder ver qué se
// consumió. Las escrituras siguen devolviendo OrderLineRow a secas -- la
// pantalla recarga la cuenta después de cada cambio.
export interface OrderLineDetail extends OrderLineRow {
  itemName: string;
}

export type AddOrderLineResult =
  | { outcome: 'added'; line: OrderLineRow }
  | { outcome: 'order_not_found' }
  | { outcome: 'order_closed' }
  | { outcome: 'item_not_found' }
  // Inactivo o archivado: una sola salida porque el POS no puede reaccionar
  // distinto ante las dos. Es una carrera -- el item estaba en el picker
  // cuando se cargo la pantalla -- y la unica respuesta util es recargar.
  | { outcome: 'item_not_available' }
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
      .select({
        id: schema.items.id,
        price: schema.items.price,
        status: schema.items.status,
        archivedAt: schema.items.archivedAt,
      })
      .from(schema.items)
      .where(eq(schema.items.id, itemId));
    if (!item) {
      return { outcome: 'item_not_found' };
    }
    // No basta con mirar el item: archivar su categoria tambien lo saca de la
    // venta, y esa condicion vive en catalog.repo.ts junto al resto.
    if (item.status !== 'active' || item.archivedAt !== null || !(await isItemSellable(itemId))) {
      return { outcome: 'item_not_available' };
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
        sentToKitchenAt: line.sentToKitchenAt,
        preparedAt: line.preparedAt,
        modifiers: modifierRows.map((m) => ({
          modifierId: m.id,
          name: m.name,
          priceDelta: m.priceDelta,
        })),
      },
    };
  });
}

export async function listOrderLines(
  branchId: number,
  orderId: number,
): Promise<OrderLineDetail[]> {
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
      itemName: schema.items.name,
      quantity: schema.orderLines.quantity,
      note: schema.orderLines.note,
      unitPrice: schema.orderLines.unitPrice,
      voidedAt: schema.orderLines.voidedAt,
      sentToKitchenAt: schema.orderLines.sentToKitchenAt,
      preparedAt: schema.orderLines.preparedAt,
    })
    .from(schema.orderLines)
    .innerJoin(schema.items, eq(schema.items.id, schema.orderLines.itemId))
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
        sentToKitchenAt: schema.orderLines.sentToKitchenAt,
        preparedAt: schema.orderLines.preparedAt,
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
        sentToKitchenAt: line.sentToKitchenAt,
        preparedAt: line.preparedAt,
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
        sentToKitchenAt: schema.orderLines.sentToKitchenAt,
        preparedAt: schema.orderLines.preparedAt,
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
        sentToKitchenAt: line.sentToKitchenAt,
        preparedAt: line.preparedAt,
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

export interface OrderTotalsView {
  subtotal: string;
  taxTotal: string;
  total: string;
}

export type GetOrderTotalsResult =
  { outcome: 'found'; totals: OrderTotalsView } | { outcome: 'order_not_found' };

// Closed orders return their frozen snapshot (what was actually billed);
// open orders get a live preview computed from the current lines, so the
// POS can show a running total before "Facturar" writes anything down.
export async function getOrderTotals(
  branchId: number,
  orderId: number,
): Promise<GetOrderTotalsResult> {
  const [order] = await db
    .select({
      status: schema.orders.status,
      subtotal: schema.orders.subtotal,
      taxTotal: schema.orders.taxTotal,
      total: schema.orders.total,
    })
    .from(schema.orders)
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.branchId, branchId)));
  if (!order) {
    return { outcome: 'order_not_found' };
  }

  if (order.status === 'closed') {
    return {
      outcome: 'found',
      totals: {
        subtotal: order.subtotal ?? '0.0000',
        taxTotal: order.taxTotal ?? '0.0000',
        total: order.total ?? '0.0000',
      },
    };
  }

  const totals = await computeOrderTotals(db, orderId);
  return {
    outcome: 'found',
    totals: {
      subtotal: totals.subtotal.toFixed(4),
      taxTotal: totals.taxTotal.toFixed(4),
      total: totals.total.toFixed(4),
    },
  };
}

export interface SentLineRow {
  id: number;
  itemId: number;
  itemName: string;
  quantity: number;
  note: string | null;
  stationId: number | null;
  stationName: string | null;
}

export type SendToKitchenResult =
  | {
      outcome: 'sent';
      dineTableName: string;
      lines: SentLineRow[];
      printResults: PrintStationResult[];
    }
  | { outcome: 'order_not_found' }
  | { outcome: 'order_closed' };

// Manual, per-order batch action (not automatic on add): marks every
// not-yet-sent, non-voided line as sent to the kitchen in one go, so a
// waiter can build up several lines and send them together as one
// comanda. A line whose item has no station assigned still gets marked
// sent -- it just won't surface on any station's ticket view, and won't
// be included in what gets printed below.
export async function sendToKitchen(
  branchId: number,
  orderId: number,
): Promise<SendToKitchenResult> {
  const result = await db.transaction(async (tx) => {
    const [order] = await tx
      .select({ status: schema.orders.status, dineTableId: schema.orders.dineTableId })
      .from(schema.orders)
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.branchId, branchId)));
    if (!order) {
      return { outcome: 'order_not_found' as const };
    }
    if (order.status === 'closed') {
      return { outcome: 'order_closed' as const };
    }

    const [table] = await tx
      .select({ name: schema.dineTables.name })
      .from(schema.dineTables)
      .where(eq(schema.dineTables.id, order.dineTableId));

    const pendingLines = await tx
      .select({
        id: schema.orderLines.id,
        itemId: schema.orderLines.itemId,
        itemName: schema.items.name,
        quantity: schema.orderLines.quantity,
        note: schema.orderLines.note,
        stationId: schema.items.stationId,
        stationName: schema.kitchenStations.name,
      })
      .from(schema.orderLines)
      .innerJoin(schema.items, eq(schema.items.id, schema.orderLines.itemId))
      .leftJoin(schema.kitchenStations, eq(schema.kitchenStations.id, schema.items.stationId))
      .where(
        and(
          eq(schema.orderLines.orderId, orderId),
          isNull(schema.orderLines.voidedAt),
          isNull(schema.orderLines.sentToKitchenAt),
        ),
      );

    if (pendingLines.length > 0) {
      await tx
        .update(schema.orderLines)
        .set({ sentToKitchenAt: new Date() })
        .where(
          inArray(
            schema.orderLines.id,
            pendingLines.map((l) => l.id),
          ),
        );
    }

    return {
      outcome: 'sent' as const,
      dineTableName: table?.name ?? `Mesa #${order.dineTableId}`,
      lines: pendingLines,
    };
  });

  if (result.outcome !== 'sent') {
    return result;
  }

  // Printing happens after the transaction commits: a network round-trip
  // to a physical printer (possibly slow, possibly unreachable) has no
  // business holding a DB lock open while it happens.
  const linesByStation = new Map<number, SentLineRow[]>();
  for (const line of result.lines) {
    if (line.stationId === null) continue;
    const existing = linesByStation.get(line.stationId) ?? [];
    existing.push(line);
    linesByStation.set(line.stationId, existing);
  }
  const printResults = await printStationTickets(
    [...linesByStation.entries()].map(([stationId, lines]) => ({
      stationId,
      dineTableName: result.dineTableName,
      orderId,
      lines: lines.map((l) => ({ quantity: l.quantity, itemName: l.itemName, note: l.note })),
    })),
  );

  return { ...result, printResults };
}
