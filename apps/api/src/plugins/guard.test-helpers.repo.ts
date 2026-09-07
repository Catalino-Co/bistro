import { db, schema } from '@bistro/db';
import { eq } from 'drizzle-orm';

export interface GuardFixture {
  branchId: number;
  businessUnitId: number;
  companyId: number;
}

export async function createBranchFixture(): Promise<GuardFixture> {
  const [company] = await db
    .insert(schema.companies)
    .values({ name: '__guard_test_co__' })
    .returning({ id: schema.companies.id });
  const [businessUnit] = await db
    .insert(schema.businessUnits)
    .values({ companyId: company!.id, name: '__guard_test_bu__' })
    .returning({ id: schema.businessUnits.id });
  const [branch] = await db
    .insert(schema.branches)
    .values({ businessUnitId: businessUnit!.id, name: '__guard_test_branch__' })
    .returning({ id: schema.branches.id });

  return { branchId: branch!.id, businessUnitId: businessUnit!.id, companyId: company!.id };
}

export async function grantAdminRole(userId: number, branchId: number): Promise<void> {
  const [adminRole] = await db
    .select({ id: schema.roles.id })
    .from(schema.roles)
    .where(eq(schema.roles.name, 'admin'));

  if (!adminRole) {
    throw new Error(
      "Seeded 'admin' role not found -- run `pnpm --filter @bistro/db run seed` first",
    );
  }

  await db.insert(schema.userRoles).values({ userId, roleId: adminRole.id, branchId });
}

// Scoped to exactly these ids (not a wildcard sweep) so it's safe to run
// concurrently with other test files' suites -- see test-helpers.repo.ts's
// deleteTestUser for the same reasoning.
export async function deleteBranchFixture(fixture: GuardFixture): Promise<void> {
  await db.delete(schema.userRoles).where(eq(schema.userRoles.branchId, fixture.branchId));
  await db.delete(schema.branches).where(eq(schema.branches.id, fixture.branchId));
  await db.delete(schema.businessUnits).where(eq(schema.businessUnits.id, fixture.businessUnitId));
  await db.delete(schema.companies).where(eq(schema.companies.id, fixture.companyId));
}
