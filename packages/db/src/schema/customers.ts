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
  // Opcionales los dos. El telefono es lo que hace util a un cliente de
  // delivery; el RNC es lo que un cliente corporativo necesita en su
  // factura, y lo que hara falta el dia que se emitan comprobantes con NCF.
  phone: text('phone'),
  taxId: text('tax_id'),
  // Un cliente no se borra: sus ordenes lo referencian. Se archiva, igual
  // que en el catalogo. Aqui no hace falta un `status` aparte -- un cliente
  // no se "pausa", o esta o no esta.
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
