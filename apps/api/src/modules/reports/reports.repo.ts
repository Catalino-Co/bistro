import { db, schema } from '@bistro/db';
import { and, eq, gte, inArray, isNull, lt } from 'drizzle-orm';
import { calculateLineTotal } from '../modifiers/pricing.js';
import { summarizeOrders } from '../orders/order-totals.repo.js';

export interface SalesFigures {
  orderCount: number;
  subtotal: string;
  taxTotal: string;
  total: string;
  /** Total entre número de órdenes; "0.0000" si no hubo ninguna. */
  averageTicket: string;
}

export interface PaymentBreakdown {
  paymentMethodId: number;
  paymentMethodName: string;
  count: number;
  amount: string;
  tipAmount: string;
}

export interface SalesSlice {
  id: number | null;
  name: string;
  quantity: number;
  amount: string;
}

export interface HourSlice {
  hour: number;
  orderCount: number;
  amount: string;
}

export interface DailySummary {
  range: { from: string; to: string };
  timezone: string;
  sales: SalesFigures;
  /** Lo que está en mesa ahora mismo, sin cobrar. No cuenta como venta. */
  openNow: { orderCount: number; total: string };
  tipTotal: string;
  payments: PaymentBreakdown[];
  byFamily: SalesSlice[];
  byStation: SalesSlice[];
  byHour: HourSlice[];
}

function money(value: number): string {
  return (Math.round(value * 10000) / 10000).toFixed(4);
}

/**
 * El resumen del día de una sucursal.
 *
 * Hasta ahora el único agregado que sabía calcular el sistema era el total
 * de UNA orden: no había forma de saber cuánto se vendió hoy sin abrirlas
 * de una en una.
 *
 * Las ventas salen de las columnas congeladas de las órdenes cerradas, no
 * de recalcular líneas, por la misma razón que el historial: un cambio de
 * ITBIS no puede reescribir el cierre de ayer. Los desgloses por familia
 * y por estación sí se calculan desde las líneas, porque esa dimensión no
 * está congelada en ningún sitio -- y usan `calculateLineTotal`, la misma
 * función que fija lo que cuesta una línea en el POS.
 */
export async function getDailySummary(
  branchId: number,
  from: Date,
  to: Date,
): Promise<DailySummary> {
  const [branch] = await db
    .select({ timezone: schema.branches.timezone })
    .from(schema.branches)
    .where(eq(schema.branches.id, branchId));
  const timezone = branch?.timezone ?? 'America/Santo_Domingo';

  const closedOrders = await db
    .select({
      id: schema.orders.id,
      closedAt: schema.orders.closedAt,
      subtotal: schema.orders.subtotal,
      taxTotal: schema.orders.taxTotal,
      total: schema.orders.total,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.branchId, branchId),
        eq(schema.orders.status, 'closed'),
        gte(schema.orders.closedAt, from),
        lt(schema.orders.closedAt, to),
      ),
    );

  const orderIds = closedOrders.map((order) => order.id);

  let subtotal = 0;
  let taxTotal = 0;
  let total = 0;
  for (const order of closedOrders) {
    subtotal += Number(order.subtotal ?? 0);
    taxTotal += Number(order.taxTotal ?? 0);
    total += Number(order.total ?? 0);
  }

  const sales: SalesFigures = {
    orderCount: closedOrders.length,
    subtotal: money(subtotal),
    taxTotal: money(taxTotal),
    total: money(total),
    averageTicket: money(closedOrders.length === 0 ? 0 : total / closedOrders.length),
  };

  // --- pagos y propinas ---
  const payments: PaymentBreakdown[] = [];
  let tipTotal = 0;
  if (orderIds.length > 0) {
    const paymentRows = await db
      .select({
        paymentMethodId: schema.payments.paymentMethodId,
        paymentMethodName: schema.paymentMethods.name,
        amount: schema.payments.amount,
        tipAmount: schema.payments.tipAmount,
      })
      .from(schema.payments)
      .innerJoin(
        schema.paymentMethods,
        eq(schema.paymentMethods.id, schema.payments.paymentMethodId),
      )
      .where(inArray(schema.payments.orderId, orderIds));

    const byMethod = new Map<number, PaymentBreakdown & { rawAmount: number; rawTip: number }>();
    for (const row of paymentRows) {
      const entry = byMethod.get(row.paymentMethodId) ?? {
        paymentMethodId: row.paymentMethodId,
        paymentMethodName: row.paymentMethodName,
        count: 0,
        amount: '0.0000',
        tipAmount: '0.0000',
        rawAmount: 0,
        rawTip: 0,
      };
      entry.count += 1;
      entry.rawAmount += Number(row.amount);
      entry.rawTip += Number(row.tipAmount);
      byMethod.set(row.paymentMethodId, entry);
      tipTotal += Number(row.tipAmount);
    }
    for (const entry of byMethod.values()) {
      payments.push({
        paymentMethodId: entry.paymentMethodId,
        paymentMethodName: entry.paymentMethodName,
        count: entry.count,
        amount: money(entry.rawAmount),
        tipAmount: money(entry.rawTip),
      });
    }
    payments.sort((a, b) => Number(b.amount) - Number(a.amount));
  }

  // --- desglose por familia y por estación ---
  const byFamily: SalesSlice[] = [];
  const byStation: SalesSlice[] = [];
  if (orderIds.length > 0) {
    const lineRows = await db
      .select({
        id: schema.orderLines.id,
        quantity: schema.orderLines.quantity,
        unitPrice: schema.orderLines.unitPrice,
        familyId: schema.families.id,
        familyName: schema.families.name,
        stationId: schema.items.stationId,
      })
      .from(schema.orderLines)
      .innerJoin(schema.items, eq(schema.items.id, schema.orderLines.itemId))
      .innerJoin(schema.categories, eq(schema.categories.id, schema.items.categoryId))
      .innerJoin(schema.subfamilies, eq(schema.subfamilies.id, schema.categories.subfamilyId))
      .innerJoin(schema.families, eq(schema.families.id, schema.subfamilies.familyId))
      .where(and(inArray(schema.orderLines.orderId, orderIds), isNull(schema.orderLines.voidedAt)));

    const deltasByLine = new Map<number, number[]>();
    const lineIds = lineRows.map((row) => row.id);
    if (lineIds.length > 0) {
      const modifierRows = await db
        .select({
          orderLineId: schema.orderLineModifiers.orderLineId,
          priceDelta: schema.orderLineModifiers.priceDelta,
        })
        .from(schema.orderLineModifiers)
        .where(inArray(schema.orderLineModifiers.orderLineId, lineIds));
      for (const row of modifierRows) {
        const existing = deltasByLine.get(row.orderLineId) ?? [];
        existing.push(Number(row.priceDelta));
        deltasByLine.set(row.orderLineId, existing);
      }
    }

    const stationNames = new Map<number, string>();
    const stations = await db
      .select({ id: schema.kitchenStations.id, name: schema.kitchenStations.name })
      .from(schema.kitchenStations);
    for (const station of stations) {
      stationNames.set(station.id, station.name);
    }

    const familyTotals = new Map<number, { name: string; quantity: number; amount: number }>();
    const stationTotals = new Map<
      number | null,
      { name: string; quantity: number; amount: number }
    >();

    for (const line of lineRows) {
      const amount = calculateLineTotal(
        Number(line.unitPrice),
        line.quantity,
        deltasByLine.get(line.id) ?? [],
      );

      const family = familyTotals.get(line.familyId) ?? {
        name: line.familyName,
        quantity: 0,
        amount: 0,
      };
      family.quantity += line.quantity;
      family.amount += amount;
      familyTotals.set(line.familyId, family);

      const stationKey = line.stationId;
      const station = stationTotals.get(stationKey) ?? {
        name:
          stationKey === null
            ? 'Sin estación'
            : (stationNames.get(stationKey) ?? `Estación #${stationKey}`),
        quantity: 0,
        amount: 0,
      };
      station.quantity += line.quantity;
      station.amount += amount;
      stationTotals.set(stationKey, station);
    }

    for (const [id, value] of familyTotals) {
      byFamily.push({
        id,
        name: value.name,
        quantity: value.quantity,
        amount: money(value.amount),
      });
    }
    for (const [id, value] of stationTotals) {
      byStation.push({
        id,
        name: value.name,
        quantity: value.quantity,
        amount: money(value.amount),
      });
    }
    byFamily.sort((a, b) => Number(b.amount) - Number(a.amount));
    byStation.sort((a, b) => Number(b.amount) - Number(a.amount));
  }

  // --- por hora ---
  // La hora es la de la sucursal, no la del servidor: un local en Santo
  // Domingo tiene que ver su pico de almuerzo a la 1 p. m. aunque la API
  // corra en otra zona.
  const hourFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false,
  });
  const hourTotals = new Map<number, { orderCount: number; amount: number }>();
  for (const order of closedOrders) {
    if (!order.closedAt) continue;
    const hour = Number(hourFormat.format(order.closedAt));
    const entry = hourTotals.get(hour) ?? { orderCount: 0, amount: 0 };
    entry.orderCount += 1;
    entry.amount += Number(order.total ?? 0);
    hourTotals.set(hour, entry);
  }
  const byHour: HourSlice[] = [...hourTotals.entries()]
    .map(([hour, value]) => ({
      hour,
      orderCount: value.orderCount,
      amount: money(value.amount),
    }))
    .sort((a, b) => a.hour - b.hour);

  // --- lo que está en mesa ahora mismo ---
  const openOrders = await db
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(and(eq(schema.orders.branchId, branchId), eq(schema.orders.status, 'open')));
  const openSummaries = await summarizeOrders(
    db,
    openOrders.map((order) => order.id),
  );
  let openTotal = 0;
  for (const summary of openSummaries.values()) {
    openTotal += summary.total;
  }

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    timezone,
    sales,
    openNow: { orderCount: openOrders.length, total: money(openTotal) },
    tipTotal: money(tipTotal),
    payments,
    byFamily,
    byStation,
    byHour,
  };
}
