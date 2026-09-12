import { db, schema } from '@bistro/db';
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { sendToPrinter } from './printer-client.js';
import { buildTicketBytes, type TicketLine } from './ticket.js';

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

export interface PrintTicketInput {
  stationId: number;
  dineTableName: string;
  orderId: number;
  lines: TicketLine[];
}

export type PrintStationResult =
  | { stationId: number; stationName: string; outcome: 'printed' }
  | { stationId: number; stationName: string; outcome: 'no_printer_configured' }
  | { stationId: number; stationName: string; outcome: 'print_failed'; error: string };

// Called from orders.repo.ts's sendToKitchen once lines are marked sent --
// deliberately outside that function's own DB transaction, since holding a
// transaction open while waiting on a network round-trip to a physical
// printer (which might be slow, or unreachable) would hold that lock far
// too long. A station with no printer configured isn't an error: it's a
// station that only uses the on-screen board.
export async function printStationTickets(
  inputs: PrintTicketInput[],
): Promise<PrintStationResult[]> {
  if (inputs.length === 0) {
    return [];
  }

  const stationIds = [...new Set(inputs.map((i) => i.stationId))];
  const configs = await db
    .select({
      id: schema.kitchenStations.id,
      name: schema.kitchenStations.name,
      printerHost: schema.kitchenStations.printerHost,
      printerPort: schema.kitchenStations.printerPort,
    })
    .from(schema.kitchenStations)
    .where(inArray(schema.kitchenStations.id, stationIds));
  const configById = new Map(configs.map((c) => [c.id, c]));

  const results: PrintStationResult[] = [];
  for (const input of inputs) {
    const config = configById.get(input.stationId);
    const stationName = config?.name ?? `Estación #${input.stationId}`;
    if (!config?.printerHost || !config.printerPort) {
      results.push({ stationId: input.stationId, stationName, outcome: 'no_printer_configured' });
      continue;
    }

    const bytes = buildTicketBytes({
      stationName,
      dineTableName: input.dineTableName,
      orderId: input.orderId,
      lines: input.lines,
    });
    const sent = await sendToPrinter(config.printerHost, config.printerPort, bytes);
    results.push(
      sent.outcome === 'printed'
        ? { stationId: input.stationId, stationName, outcome: 'printed' }
        : { stationId: input.stationId, stationName, outcome: 'print_failed', error: sent.error },
    );
  }
  return results;
}
