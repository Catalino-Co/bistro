import { db, schema } from '@bistro/db';
import { and, eq } from 'drizzle-orm';

export interface BranchOption {
  id: number;
  name: string;
  businessUnitName: string;
  companyName: string;
}

export async function listBranchesForUser(userId: number): Promise<BranchOption[]> {
  const rows = await db
    .selectDistinct({
      id: schema.branches.id,
      name: schema.branches.name,
      businessUnitName: schema.businessUnits.name,
      companyName: schema.companies.name,
    })
    .from(schema.userRoles)
    .innerJoin(schema.branches, eq(schema.branches.id, schema.userRoles.branchId))
    .innerJoin(schema.businessUnits, eq(schema.businessUnits.id, schema.branches.businessUnitId))
    .innerJoin(schema.companies, eq(schema.companies.id, schema.businessUnits.companyId))
    .where(eq(schema.userRoles.userId, userId));

  return rows;
}

export async function userHasRoleInBranch(userId: number, branchId: number): Promise<boolean> {
  const [row] = await db
    .select({ userId: schema.userRoles.userId })
    .from(schema.userRoles)
    .where(and(eq(schema.userRoles.userId, userId), eq(schema.userRoles.branchId, branchId)));

  return row !== undefined;
}

export async function findBranchById(branchId: number): Promise<BranchOption | null> {
  const [row] = await db
    .select({
      id: schema.branches.id,
      name: schema.branches.name,
      businessUnitName: schema.businessUnits.name,
      companyName: schema.companies.name,
    })
    .from(schema.branches)
    .innerJoin(schema.businessUnits, eq(schema.businessUnits.id, schema.branches.businessUnitId))
    .innerJoin(schema.companies, eq(schema.companies.id, schema.businessUnits.companyId))
    .where(eq(schema.branches.id, branchId));

  return row ?? null;
}
