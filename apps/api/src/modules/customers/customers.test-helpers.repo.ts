import { db, schema } from '@bistro/db';
import { inArray } from 'drizzle-orm';

/**
 * Limpieza por id explicito. Los clientes no llevan prefijo de sucursal ni
 * los barre deleteBranchFixture, asi que cada test se lleva los suyos -- y
 * nunca por patron de nombre sobre una tabla con datos reales.
 */
export async function deleteCustomerFixtures(customerIds: number[]): Promise<void> {
  if (customerIds.length === 0) return;
  await db
    .delete(schema.auditLog)
    .where(inArray(schema.auditLog.entityId, customerIds.map(String)));
  await db.delete(schema.customers).where(inArray(schema.customers.id, customerIds));
}
