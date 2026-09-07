import { bigint, timestamp } from 'drizzle-orm/pg-core';
import { bistro } from './_shared.js';
import { branches } from './org.js';
import { dineTables } from './floor.js';

// Minimal order lifecycle for B1-6: opening an order occupies its table,
// closing (billing) frees it. Order lines/modifiers/dispatch modes are
// added on top of this in B1-7/B1-8 -- this table only tracks the
// open/closed state that drives dining_tables.status.
export const orderStatusEnum = bistro.enum('order_status', ['open', 'closed']);

export const orders = bistro.table('orders', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  branchId: bigint('branch_id', { mode: 'number' })
    .notNull()
    .references(() => branches.id),
  dineTableId: bigint('dine_table_id', { mode: 'number' })
    .notNull()
    .references(() => dineTables.id),
  status: orderStatusEnum('status').notNull().default('open'),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
});
