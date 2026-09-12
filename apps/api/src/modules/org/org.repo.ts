import { db, schema } from '@bistro/db';
import { eq } from 'drizzle-orm';

export interface CompanyRow {
  id: number;
  name: string;
  taxId: string | null;
  status: 'active' | 'inactive';
}

export interface BusinessUnitRow {
  id: number;
  companyId: number;
  name: string;
  status: 'active' | 'inactive';
}

export interface BranchRow {
  id: number;
  businessUnitId: number;
  name: string;
  timezone: string;
  status: 'active' | 'inactive';
}

export async function listCompanies(): Promise<CompanyRow[]> {
  return db
    .select({
      id: schema.companies.id,
      name: schema.companies.name,
      taxId: schema.companies.taxId,
      status: schema.companies.status,
    })
    .from(schema.companies);
}

export async function insertCompany(name: string, taxId: string | null): Promise<CompanyRow> {
  const [row] = await db.insert(schema.companies).values({ name, taxId }).returning({
    id: schema.companies.id,
    name: schema.companies.name,
    taxId: schema.companies.taxId,
    status: schema.companies.status,
  });
  if (!row) throw new Error('Failed to create company');
  return row;
}

export async function listBusinessUnits(companyId?: number): Promise<BusinessUnitRow[]> {
  const query = db
    .select({
      id: schema.businessUnits.id,
      companyId: schema.businessUnits.companyId,
      name: schema.businessUnits.name,
      status: schema.businessUnits.status,
    })
    .from(schema.businessUnits);
  return companyId !== undefined
    ? query.where(eq(schema.businessUnits.companyId, companyId))
    : query;
}

export async function insertBusinessUnit(
  companyId: number,
  name: string,
): Promise<BusinessUnitRow> {
  const [row] = await db.insert(schema.businessUnits).values({ companyId, name }).returning({
    id: schema.businessUnits.id,
    companyId: schema.businessUnits.companyId,
    name: schema.businessUnits.name,
    status: schema.businessUnits.status,
  });
  if (!row) throw new Error('Failed to create business unit');
  return row;
}

export async function listBranches(businessUnitId?: number): Promise<BranchRow[]> {
  const query = db
    .select({
      id: schema.branches.id,
      businessUnitId: schema.branches.businessUnitId,
      name: schema.branches.name,
      timezone: schema.branches.timezone,
      status: schema.branches.status,
    })
    .from(schema.branches);
  return businessUnitId !== undefined
    ? query.where(eq(schema.branches.businessUnitId, businessUnitId))
    : query;
}

export async function insertBranch(
  businessUnitId: number,
  name: string,
  timezone: string,
): Promise<BranchRow> {
  const [row] = await db
    .insert(schema.branches)
    .values({ businessUnitId, name, timezone })
    .returning({
      id: schema.branches.id,
      businessUnitId: schema.branches.businessUnitId,
      name: schema.branches.name,
      timezone: schema.branches.timezone,
      status: schema.branches.status,
    });
  if (!row) throw new Error('Failed to create branch');
  return row;
}

export async function updateBranchRow(
  id: number,
  values: {
    name?: string | undefined;
    timezone?: string | undefined;
    status?: ('active' | 'inactive') | undefined;
  },
): Promise<void> {
  const patch: Partial<typeof schema.branches.$inferInsert> = {};
  if (values.name !== undefined) patch.name = values.name;
  if (values.timezone !== undefined) patch.timezone = values.timezone;
  if (values.status !== undefined) patch.status = values.status;
  if (Object.keys(patch).length === 0) return;

  await db.update(schema.branches).set(patch).where(eq(schema.branches.id, id));
}

export async function companyExists(id: number): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.companies.id })
    .from(schema.companies)
    .where(eq(schema.companies.id, id));
  return row !== undefined;
}

export async function businessUnitExists(id: number): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.businessUnits.id })
    .from(schema.businessUnits)
    .where(eq(schema.businessUnits.id, id));
  return row !== undefined;
}

export async function findBranchRow(id: number): Promise<BranchRow | null> {
  const [row] = await db
    .select({
      id: schema.branches.id,
      businessUnitId: schema.branches.businessUnitId,
      name: schema.branches.name,
      timezone: schema.branches.timezone,
      status: schema.branches.status,
    })
    .from(schema.branches)
    .where(eq(schema.branches.id, id));
  return row ?? null;
}
