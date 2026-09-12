import { bigint, integer, text } from 'drizzle-orm/pg-core';
import { bistro, statusEnum } from './_shared.js';

// Unlike tax_rates/payment_methods (near-universal, seeded), a kitchen's
// stations (parrilla, bar, postres, ...) are specific to each restaurant --
// no seed data here, an admin creates their own via the catalog screen.
export const kitchenStations = bistro.table('kitchen_stations', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull().unique(),
  // Network ESC/POS thermal printer physically at this station -- both
  // null means "no printer configured", a valid on-screen-only station.
  // No local/USB printing here: kitchen printers sit at the station, not
  // next to a POS terminal, so a raw TCP socket from the server is the
  // realistic integration, not the browser's print dialog.
  printerHost: text('printer_host'),
  printerPort: integer('printer_port'),
  status: statusEnum('status').notNull().default('active'),
});
