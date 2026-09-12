import { bigint, numeric, text } from 'drizzle-orm/pg-core';
import { bistro, statusEnum } from './_shared.js';
import { taxRates } from './catalog.js';
import { kitchenStations } from './kitchen.js';

// categories -> families -> subfamilies -> items mirrors the legacy's
// hierarchy, but every level gets real CRUD here -- the legacy had no UI
// to create a subfamily at all (rest_insert_category.php never even sent
// inc_family/inc_subfamily), so reports could filter by subfamily but
// nothing could create one outside of SQL.
export const categories = bistro.table('categories', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  status: statusEnum('status').notNull().default('active'),
});

export const families = bistro.table('families', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  categoryId: bigint('category_id', { mode: 'number' })
    .notNull()
    .references(() => categories.id),
  name: text('name').notNull(),
  status: statusEnum('status').notNull().default('active'),
});

export const subfamilies = bistro.table('subfamilies', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  familyId: bigint('family_id', { mode: 'number' })
    .notNull()
    .references(() => families.id),
  name: text('name').notNull(),
  status: statusEnum('status').notNull().default('active'),
});

export const items = bistro.table('items', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  subfamilyId: bigint('subfamily_id', { mode: 'number' })
    .notNull()
    .references(() => subfamilies.id),
  name: text('name').notNull(),
  price: numeric('price', { precision: 12, scale: 4 }).notNull(),
  taxRateId: bigint('tax_rate_id', { mode: 'number' })
    .notNull()
    .references(() => taxRates.id),
  // Nullable: existing items predate stations, and not every restaurant
  // wants to route everything on day one. A line for an unassigned item
  // still marks fine as "sent to kitchen" -- it just won't show up on any
  // station's ticket view.
  stationId: bigint('station_id', { mode: 'number' }).references(() => kitchenStations.id),
  status: statusEnum('status').notNull().default('active'),
});
