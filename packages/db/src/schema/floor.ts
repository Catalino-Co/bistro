import { bigint, integer, text } from 'drizzle-orm/pg-core';
import { bistro } from './_shared.js';
import { branches } from './org.js';

// Real CRUD for areas and tables -- the legacy's ajuste-mesas.php was
// read-only (buttons with no handler) and ajuste-dine-areas.php, listed in
// the router's whitelist, didn't even exist as a file.
export const dineAreas = bistro.table('dine_areas', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  branchId: bigint('branch_id', { mode: 'number' })
    .notNull()
    .references(() => branches.id),
  name: text('name').notNull(),
});

export const dineTableStatusEnum = bistro.enum('dine_table_status', [
  'available',
  'occupied',
  'reserved',
]);

export const dineTables = bistro.table('dining_tables', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  dineAreaId: bigint('dine_area_id', { mode: 'number' })
    .notNull()
    .references(() => dineAreas.id),
  name: text('name').notNull(),
  seats: integer('seats').notNull().default(2),
  status: dineTableStatusEnum('status').notNull().default('available'),
});
