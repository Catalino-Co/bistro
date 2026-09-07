import { db, schema } from '@bistro/db';
import { eq } from 'drizzle-orm';

export interface BranchFixture {
  branchId: number;
  businessUnitId: number;
  companyId: number;
}

export async function createBranchFixture(suffix: string): Promise<BranchFixture> {
  const [company] = await db
    .insert(schema.companies)
    .values({ name: `__branches_test_co_${suffix}__` })
    .returning({ id: schema.companies.id });
  const [businessUnit] = await db
    .insert(schema.businessUnits)
    .values({ companyId: company!.id, name: `__branches_test_bu_${suffix}__` })
    .returning({ id: schema.businessUnits.id });
  const [branch] = await db
    .insert(schema.branches)
    .values({ businessUnitId: businessUnit!.id, name: `__branches_test_branch_${suffix}__` })
    .returning({ id: schema.branches.id });

  return { branchId: branch!.id, businessUnitId: businessUnit!.id, companyId: company!.id };
}

export async function deleteBranchFixture(fixture: BranchFixture): Promise<void> {
  // sessions.branch_id and audit_log.branch_id both reference branches
  // with no cascade -- a test that selected this branch (POST
  // /branches/select) leaves it on the session row and on the
  // branch.selected audit event, which would otherwise block this delete.
  await db.delete(schema.sessions).where(eq(schema.sessions.branchId, fixture.branchId));
  await db.delete(schema.auditLog).where(eq(schema.auditLog.branchId, fixture.branchId));
  await db.delete(schema.userRoles).where(eq(schema.userRoles.branchId, fixture.branchId));
  await db.delete(schema.branches).where(eq(schema.branches.id, fixture.branchId));
  await db.delete(schema.businessUnits).where(eq(schema.businessUnits.id, fixture.businessUnitId));
  await db.delete(schema.companies).where(eq(schema.companies.id, fixture.companyId));
}

export async function assignRole(
  userId: number,
  roleName: string,
  branchId: number,
): Promise<void> {
  const [role] = await db
    .select({ id: schema.roles.id })
    .from(schema.roles)
    .where(eq(schema.roles.name, roleName));
  if (!role) {
    throw new Error(`Role not found: ${roleName}`);
  }
  await db.insert(schema.userRoles).values({ userId, roleId: role.id, branchId });
}
