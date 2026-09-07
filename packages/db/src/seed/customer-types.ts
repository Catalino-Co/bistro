import { sql } from 'drizzle-orm';
import { db } from '../client';
import { customerTypes } from '../schema';

// Mirrors the legacy's 4 customer types (cus_cut_id), but allowsRoomService
// is now a real column instead of an `if` scattered through the POS --
// only guests may dispatch an order as room service.
const CUSTOMER_TYPES = [
  { name: 'Employee', allowsRoomService: false },
  { name: 'External', allowsRoomService: false },
  { name: 'Corporate', allowsRoomService: false },
  { name: 'Hotel Guest', allowsRoomService: true },
];

export async function seedCustomerTypes() {
  return db
    .insert(customerTypes)
    .values(CUSTOMER_TYPES)
    .onConflictDoUpdate({
      target: customerTypes.name,
      set: { allowsRoomService: sql`excluded.allows_room_service` },
    })
    .returning();
}
