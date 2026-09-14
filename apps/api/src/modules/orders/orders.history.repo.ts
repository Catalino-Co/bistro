import { db, schema } from '@bistro/db';
import { and, desc, eq, gte, lt, ilike, or, type SQL } from 'drizzle-orm';
import { summarizeOrders } from './order-totals.repo.js';

export interface OrderHistoryRow {
  id: number;
  status: 'open' | 'closed';
  dispatchMode: 'dine_in' | 'delivery' | 'pickup' | 'room_service';
  dineTableId: number;
  dineTableName: string;
  areaName: string;
  customerName: string | null;
  openedAt: string;
  closedAt: string | null;
  /** Congelado si está cerrada; en vivo si sigue abierta. */
  total: string;
  lineCount: number;
}

export interface OrderHistoryFilters {
  status?: 'open' | 'closed' | undefined;
  customerId?: number | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  search?: string | undefined;
  limit: number;
}

/**
 * El historial de órdenes de una sucursal.
 *
 * Hasta ahora una orden cerrada desaparecía del alcance de la interfaz:
 * no había ninguna ruta que listara órdenes, así que al cobrarla dejaba de
 * existir para quien usa el sistema. Los datos siempre estuvieron ahí.
 *
 * El total de una orden cerrada sale de las columnas congeladas al
 * cobrarla, no de recalcular sus líneas: si mañana cambia el ITBIS, una
 * factura de ayer tiene que seguir diciendo lo que se cobró. Solo las
 * abiertas se calculan en vivo.
 */
export async function listOrders(
  branchId: number,
  filters: OrderHistoryFilters,
): Promise<OrderHistoryRow[]> {
  const conditions: SQL[] = [eq(schema.orders.branchId, branchId)];
  if (filters.status) {
    conditions.push(eq(schema.orders.status, filters.status));
  }
  if (filters.customerId !== undefined) {
    conditions.push(eq(schema.orders.customerId, filters.customerId));
  }
  if (filters.from) {
    conditions.push(gte(schema.orders.openedAt, filters.from));
  }
  if (filters.to) {
    conditions.push(lt(schema.orders.openedAt, filters.to));
  }
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    const numeric = Number(filters.search);
    const byName = or(
      ilike(schema.dineTables.name, pattern),
      ilike(schema.customers.name, pattern),
    )!;
    conditions.push(
      Number.isInteger(numeric) && numeric > 0
        ? or(byName, eq(schema.orders.id, numeric))!
        : byName,
    );
  }

  const rows = await db
    .select({
      id: schema.orders.id,
      status: schema.orders.status,
      dispatchMode: schema.orders.dispatchMode,
      dineTableId: schema.orders.dineTableId,
      dineTableName: schema.dineTables.name,
      areaName: schema.dineAreas.name,
      customerName: schema.customers.name,
      openedAt: schema.orders.openedAt,
      closedAt: schema.orders.closedAt,
      frozenTotal: schema.orders.total,
    })
    .from(schema.orders)
    .innerJoin(schema.dineTables, eq(schema.dineTables.id, schema.orders.dineTableId))
    .innerJoin(schema.dineAreas, eq(schema.dineAreas.id, schema.dineTables.dineAreaId))
    .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
    .where(and(...conditions))
    .orderBy(desc(schema.orders.openedAt))
    .limit(filters.limit);

  // Un solo resumen para todas: de las cerradas se usa solo el conteo de
  // líneas (que no está en la fila de la orden); su total sale congelado.
  const summaries = await summarizeOrders(
    db,
    rows.map((row) => row.id),
  );

  return rows.map((row) => {
    const summary = summaries.get(row.id);
    return {
      id: row.id,
      status: row.status,
      dispatchMode: row.dispatchMode,
      dineTableId: row.dineTableId,
      dineTableName: row.dineTableName,
      areaName: row.areaName,
      customerName: row.customerName ?? null,
      openedAt: row.openedAt.toISOString(),
      closedAt: row.closedAt?.toISOString() ?? null,
      total:
        row.status === 'closed' ? (row.frozenTotal ?? '0.0000') : (summary?.total ?? 0).toFixed(4),
      lineCount: summary?.lineCount ?? 0,
    };
  });
}
