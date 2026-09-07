import { boolean, numeric, text, timestamp, bigint } from 'drizzle-orm/pg-core';
import { bistro, statusEnum } from './_shared.js';

// Read everywhere tax needs to be computed instead of the legacy's 18%
// hardcoded in half a dozen files. `rate` is a fraction (0.1800 = 18%).
export const taxRates = bistro.table('tax_rates', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull().unique(),
  rate: numeric('rate', { precision: 6, scale: 4 }).notNull(),
  status: statusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// `allowsRoomService` makes "room-service dispatch requires a hotel-guest
// customer" a data-driven check (enforced by a constraint once orders exist
// in Fase 1), not an `if` buried in application code.
export const customerTypes = bistro.table('customer_types', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull().unique(),
  allowsRoomService: boolean('allows_room_service').notNull().default(false),
});
