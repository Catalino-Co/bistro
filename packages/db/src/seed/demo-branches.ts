import { and, eq } from 'drizzle-orm';
import { db } from '../client.js';
import { branches, businessUnits, companies } from '../schema/index.js';

const COMPANY_NAME = 'Grupo Demo';
const BUSINESS_UNIT_NAME = 'Unidad Demo';
const BRANCH_NAMES = ['Sucursal Centro', 'Sucursal Norte'];

// Demo org data, not a real customer's chain -- gives a fresh install two
// real, switchable branches (see branches.routes.ts's replacement of the
// legacy's hardcoded bra_id=1) without anyone having to insert rows by
// hand. Unlike tax_rates/customer_types/payment_methods, companies/
// business_units/branches have no unique constraint on name (two
// companies in a real deployment could legitimately share a branch name),
// so this is a manual find-or-create rather than onConflictDoUpdate.
export async function seedDemoBranches() {
  let [company] = await db.select().from(companies).where(eq(companies.name, COMPANY_NAME));
  if (!company) {
    [company] = await db.insert(companies).values({ name: COMPANY_NAME }).returning();
  }
  if (!company) {
    throw new Error('Failed to seed demo company');
  }

  let [businessUnit] = await db
    .select()
    .from(businessUnits)
    .where(and(eq(businessUnits.companyId, company.id), eq(businessUnits.name, BUSINESS_UNIT_NAME)));
  if (!businessUnit) {
    [businessUnit] = await db
      .insert(businessUnits)
      .values({ companyId: company.id, name: BUSINESS_UNIT_NAME })
      .returning();
  }
  if (!businessUnit) {
    throw new Error('Failed to seed demo business unit');
  }

  const seeded = [];
  for (const name of BRANCH_NAMES) {
    let [branch] = await db
      .select()
      .from(branches)
      .where(and(eq(branches.businessUnitId, businessUnit.id), eq(branches.name, name)));
    if (!branch) {
      [branch] = await db.insert(branches).values({ businessUnitId: businessUnit.id, name }).returning();
    }
    if (branch) seeded.push(branch);
  }
  return seeded;
}
