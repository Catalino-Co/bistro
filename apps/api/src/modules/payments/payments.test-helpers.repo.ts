import { db, schema } from '@bistro/db';
import { eq } from 'drizzle-orm';

export async function findPaymentMethodIdByName(name: string): Promise<number> {
  const [row] = await db
    .select({ id: schema.paymentMethods.id })
    .from(schema.paymentMethods)
    .where(eq(schema.paymentMethods.name, name));
  if (!row) {
    throw new Error(`Payment method not found: ${name} -- run the db seed first`);
  }
  return row.id;
}
