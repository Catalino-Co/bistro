import { db, schema } from '@bistro/db';
import { and, eq } from 'drizzle-orm';
import { summarizeOrders } from './order-totals.repo.js';

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
 * El mapa de mesas de una sucursal, con la orden abierta y su total, en un
 * número fijo de consultas -- no una por mesa.
 *
 * La alternativa obvia (listar mesas y luego pedir el total de cada una)
 * hace una consulta por orden abierta, y esta pantalla se refresca sola
 * durante el servicio.
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

  const summaries = await summarizeOrders(
    db,
    orderRows.map((row) => row.id),
  );

  const orderByTableId = new Map<number, TableMapOrder>();
  for (const order of orderRows) {
    const summary = summaries.get(order.id);
    orderByTableId.set(order.dineTableId, {
      id: order.id,
      openedAt: order.openedAt.toISOString(),
      dispatchMode: order.dispatchMode,
      total: (summary?.total ?? 0).toFixed(4),
      lineCount: summary?.lineCount ?? 0,
      pendingToSend: summary?.pendingToSend ?? 0,
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
