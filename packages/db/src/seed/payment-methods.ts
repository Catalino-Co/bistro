import { sql } from 'drizzle-orm';
import { db } from '../client.js';
import { paymentMethods } from '../schema/index.js';

const PAYMENT_METHODS = ['Efectivo', 'Tarjeta'];

export async function seedPaymentMethods() {
  return db
    .insert(paymentMethods)
    .values(PAYMENT_METHODS.map((name) => ({ name })))
    .onConflictDoUpdate({
      target: paymentMethods.name,
      set: { status: sql`excluded.status` },
    })
    .returning();
}
