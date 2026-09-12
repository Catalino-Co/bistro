import { db, schema } from '@bistro/db';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { calculateOrderTotals } from './totals.js';

export interface TableMapOrder {
  id: number;
  openedAt: string;
  dispatchMode: 'dine_in' | 'delivery' | 'pickup' | 'room_service';
  /** Total en vivo, no el congelado: la orden todavía está abierta. */
  total: string;
  lineCount: number;
  /** Líneas activas que aún no se han enviado a cocina. */
  pendingToSend: number;
}

export interface TableMapTable {
  id: number;
  name: string;
  seats: number;
  status: 'available' | 'occupied' | 'reserved';
  order: TableMapOrder | null;
}

export interface TableMapArea {
  id: number;
  name: string;
  tables: TableMapTable[];
}

/**
 * El mapa de mesas de una sucursal, con la orden abierta y su total en
 * cuatro consultas fijas -- no una por mesa.
 *
 * La alternativa obvia (listar mesas y luego pedir el total de cada una con
 * computeOrderTotals) hace una consulta por orden abierta, y esta pantalla
 * se refresca sola durante el servicio. Aquí se traen todas las líneas de
 * todas las órdenes abiertas de golpe y se agrupan en memoria, pero el
 * cálculo sigue pasando por `calculateOrderTotals`: es la misma función
 * pura que usa el cierre de orden, así que el total del mapa nunca puede
 * divergir del que se cobra.
 */
export async function getTableMap(branchId: number): Promise<TableMapArea[]> {
  const tableRows = await db
    .select({
      areaId: schema.dineAreas.id,
      areaName: schema.dineAreas.name,
      tableId: schema.dineTables.id,
      tableName: schema.dineTables.name,
      seats: schema.dineTables.seats,
      status: schema.dineTables.status,
    })
    .from(schema.dineAreas)
    .leftJoin(schema.dineTables, eq(schema.dineTables.dineAreaId, schema.dineAreas.id))
    .where(eq(schema.dineAreas.branchId, branchId));

  const orderRows = await db
    .select({
      id: schema.orders.id,
      dineTableId: schema.orders.dineTableId,
      openedAt: schema.orders.openedAt,
      dispatchMode: schema.orders.dispatchMode,
    })
    .from(schema.orders)
    .where(and(eq(schema.orders.branchId, branchId), eq(schema.orders.status, 'open')));

  const orderIds = orderRows.map((row) => row.id);
  const lineRows =
    orderIds.length === 0
      ? []
      : await db
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
          .where(
            and(inArray(schema.orderLines.orderId, orderIds), isNull(schema.orderLines.voidedAt)),
          );

  const lineIds = lineRows.map((row) => row.id);
  const modifierDeltasByLine = new Map<number, number[]>();
  if (lineIds.length > 0) {
    const modifierRows = await db
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

  const orderByTableId = new Map<number, TableMapOrder>();
  for (const order of orderRows) {
    const lines = linesByOrder.get(order.id) ?? [];
    const totals = calculateOrderTotals(
      lines.map((line) => ({
        unitPrice: Number(line.unitPrice),
        quantity: line.quantity,
        modifierPriceDeltas: modifierDeltasByLine.get(line.id) ?? [],
        taxRate: Number(line.taxRate),
      })),
    );
    orderByTableId.set(order.dineTableId, {
      id: order.id,
      openedAt: order.openedAt.toISOString(),
      dispatchMode: order.dispatchMode,
      total: totals.total.toFixed(4),
      lineCount: lines.length,
      pendingToSend: lines.filter((line) => line.sentToKitchenAt === null).length,
    });
  }

  // El left join deja un área sin mesas con una fila de columnas nulas; se
  // conserva el área (existe y hay que poder verla vacía) y se descarta esa
  // fila fantasma como mesa.
  const areas = new Map<number, TableMapArea>();
  for (const row of tableRows) {
    const area = areas.get(row.areaId) ?? { id: row.areaId, name: row.areaName, tables: [] };
    if (row.tableId !== null && row.tableName !== null && row.seats !== null) {
      area.tables.push({
        id: row.tableId,
        name: row.tableName,
        seats: row.seats,
        status: row.status ?? 'available',
        order: orderByTableId.get(row.tableId) ?? null,
      });
    }
    areas.set(row.areaId, area);
  }

  return [...areas.values()];
}
