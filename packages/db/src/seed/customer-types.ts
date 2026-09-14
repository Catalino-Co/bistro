import { eq, sql } from 'drizzle-orm';
import { db } from '../client.js';
import { customerTypes } from '../schema/index.js';

// Mirrors the legacy's 4 customer types (cus_cut_id), but allowsRoomService
// is now a real column instead of an `if` scattered through the POS --
// only guests may dispatch an order as room service.
//
// The names are user-facing: they show up in the POS when a waiter picks a
// customer, and the app is in Spanish.
const CUSTOMER_TYPES = [
  { name: 'Empleado', allowsRoomService: false },
  { name: 'Externo', allowsRoomService: false },
  { name: 'Corporativo', allowsRoomService: false },
  { name: 'Huésped', allowsRoomService: true },
];

// These four shipped in English first. The upsert below keys on `name`, so
// without this pass a re-seed would insert the Spanish four and leave the
// English ones orphaned -- with every existing customer still pointing at
// the old row. Renaming by the old name keeps each customer's type intact,
// and on a fresh database it simply matches nothing.
const RENAMES: { from: string; to: string }[] = [
  { from: 'Employee', to: 'Empleado' },
  { from: 'External', to: 'Externo' },
  { from: 'Corporate', to: 'Corporativo' },
  { from: 'Hotel Guest', to: 'Huésped' },
];

export async function seedCustomerTypes() {
  for (const rename of RENAMES) {
    await db
      .update(customerTypes)
      .set({ name: rename.to })
      .where(eq(customerTypes.name, rename.from));
  }

  return db
    .insert(customerTypes)
    .values(CUSTOMER_TYPES)
    .onConflictDoUpdate({
      target: customerTypes.name,
      set: { allowsRoomService: sql`excluded.allows_room_service` },
    })
    .returning();
}
