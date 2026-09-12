import { bigint, text } from 'drizzle-orm/pg-core';
import { bistro, statusEnum } from './_shared.js';

// Unlike tax_rates/payment_methods (near-universal, seeded), a kitchen's
// stations (parrilla, bar, postres, ...) are specific to each restaurant --
// no seed data here, an admin creates their own via the catalog screen.
export const kitchenStations = bistro.table('kitchen_stations', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull().unique(),
  status: statusEnum('status').notNull().default('active'),
});
