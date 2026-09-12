import { bigint, numeric, timestamp } from 'drizzle-orm/pg-core';
import { bistro } from './_shared.js';
import { branches } from './org.js';
import { customers } from './customers.js';
import { dineTables } from './floor.js';

// Minimal order lifecycle for B1-6: opening an order occupies its table,
// closing (billing) frees it. Order lines/modifiers are added on top of
// this in B1-7 -- this table only tracks the open/closed state that
// drives dining_tables.status.
export const orderStatusEnum = bistro.enum('order_status', ['open', 'closed']);

// room_service requires a customer whose type allows it -- enforced by a
// trigger (see migration 0010) so a client bypassing the UI still can't
// create an invalid room_service order. That's why customer_id has to be
// nullable at the column level: dine_in/delivery/pickup never require one,
// only room_service does, and only the trigger knows which mode is which.
export const orderDispatchModeEnum = bistro.enum('order_dispatch_mode', [
  'dine_in',
  'delivery',
  'pickup',
  'room_service',
]);

export const orders = bistro.table('orders', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  branchId: bigint('branch_id', { mode: 'number' })
    .notNull()
    .references(() => branches.id),
  dineTableId: bigint('dine_table_id', { mode: 'number' })
    .notNull()
    .references(() => dineTables.id),
  status: orderStatusEnum('status').notNull().default('open'),
  dispatchMode: orderDispatchModeEnum('dispatch_mode').notNull().default('dine_in'),
  customerId: bigint('customer_id', { mode: 'number' }).references(() => customers.id),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  // Frozen at close time, from each line's own snapshot unit_price/price_delta
  // and its item's tax rate at that moment -- same reasoning as order_lines
  // snapshotting unit_price: a later tax_rates change shouldn't retroactively
  // change what a closed (billed) order shows as its total. Null until closed.
  subtotal: numeric('subtotal', { precision: 12, scale: 4 }),
  taxTotal: numeric('tax_total', { precision: 12, scale: 4 }),
  total: numeric('total', { precision: 12, scale: 4 }),
});
