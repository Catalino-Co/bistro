import { bigint, numeric, text, timestamp } from 'drizzle-orm/pg-core';
import { bistro, statusEnum } from './_shared.js';
import { orders } from './orders.js';

// Configurable, like tax_rates/customer_types, so a new method (e.g. a
// transfer) can be added later without a migration.
export const paymentMethods = bistro.table('payment_methods', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull().unique(),
  status: statusEnum('status').notNull().default('active'),
});

export const payments = bistro.table('payments', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  orderId: bigint('order_id', { mode: 'number' })
    .notNull()
    .references(() => orders.id),
  paymentMethodId: bigint('payment_method_id', { mode: 'number' })
    .notNull()
    .references(() => paymentMethods.id),
  // What this payment applies toward the order's total -- excludes tip and,
  // for cash, the change handed back. A split bill is just several rows here
  // against the same order_id, possibly with different payment methods.
  amount: numeric('amount', { precision: 12, scale: 4 }).notNull(),
  tipAmount: numeric('tip_amount', { precision: 12, scale: 4 }).notNull().default('0'),
  // Cash only: what the customer physically handed over, so change (tendered
  // - amount) can be shown on a receipt. Null for card and other methods.
  tenderedAmount: numeric('tendered_amount', { precision: 12, scale: 4 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
