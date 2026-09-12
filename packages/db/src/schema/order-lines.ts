import { bigint, integer, numeric, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { bistro } from './_shared.js';
import { items } from './menu.js';
import { modifiers } from './modifiers.js';
import { orders } from './orders.js';

// Each line carries its own note -- the legacy printed one note for the
// whole comanda, so two lines of the same item could never say different
// things (e.g. "sin cebolla" on one, "bien cocido" on the other).
export const orderLines = bistro.table('order_lines', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  orderId: bigint('order_id', { mode: 'number' })
    .notNull()
    .references(() => orders.id),
  itemId: bigint('item_id', { mode: 'number' })
    .notNull()
    .references(() => items.id),
  quantity: integer('quantity').notNull().default(1),
  note: text('note'),
  // Snapshot of items.price at the time the line was added, so a later
  // catalog price change doesn't retroactively change an existing order.
  unitPrice: numeric('unit_price', { precision: 12, scale: 4 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // Soft-cancel: a voided line stays on the order (and visible in the POS,
  // struck through) instead of being deleted, so a mistaken or
  // changed-mind item still shows up in what was ordered.
  voidedAt: timestamp('voided_at', { withTimezone: true }),
  // "Enviar a cocina" is a manual, per-order batch action (not automatic on
  // add), so a line can sit unsent while the waiter is still building the
  // order. preparedAt is set by kitchen staff from the station's ticket
  // view, independently of sentToKitchenAt.
  sentToKitchenAt: timestamp('sent_to_kitchen_at', { withTimezone: true }),
  preparedAt: timestamp('prepared_at', { withTimezone: true }),
});

export const orderLineModifiers = bistro.table(
  'order_line_modifiers',
  {
    orderLineId: bigint('order_line_id', { mode: 'number' })
      .notNull()
      .references(() => orderLines.id),
    modifierId: bigint('modifier_id', { mode: 'number' })
      .notNull()
      .references(() => modifiers.id),
    // Snapshot of modifiers.price_delta at the time it was added, for the
    // same reason as order_lines.unit_price above.
    priceDelta: numeric('price_delta', { precision: 12, scale: 4 }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.orderLineId, table.modifierId] })],
);
