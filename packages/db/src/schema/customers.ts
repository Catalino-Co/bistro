import { bigint, text, timestamp } from 'drizzle-orm/pg-core';
import { bistro } from './_shared.js';
import { customerTypes } from './catalog.js';

// Minimal customer record for B1-8's room_service dispatch constraint --
// the quick-add flow with XSS-safe display (B1-11) builds on this same
// table.
export const customers = bistro.table('customers', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  customerTypeId: bigint('customer_type_id', { mode: 'number' })
    .notNull()
    .references(() => customerTypes.id),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
