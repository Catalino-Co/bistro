import { db, schema } from '@bistro/db';
import { inArray } from 'drizzle-orm';

/**
 * Limpieza por id explícito, nunca por patrón de nombre con comodín: un
 * `LIKE` mal escapado sobre `branches` borra sucursales reales.
 */
export async function deleteOrgFixtures(fixtures: {
  branchIds: number[];
  businessUnitIds: number[];
  companyIds: number[];
}): Promise<void> {
  if (fixtures.branchIds.length > 0) {
    await db.delete(schema.auditLog).where(inArray(schema.auditLog.branchId, fixtures.branchIds));
    await db.delete(schema.branches).where(inArray(schema.branches.id, fixtures.branchIds));
  }
  if (fixtures.businessUnitIds.length > 0) {
    await db
      .delete(schema.businessUnits)
      .where(inArray(schema.businessUnits.id, fixtures.businessUnitIds));
  }
  if (fixtures.companyIds.length > 0) {
    await db.delete(schema.companies).where(inArray(schema.companies.id, fixtures.companyIds));
  }
}
