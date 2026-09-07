import { db, schema } from '@bistro/db';
import { eq, like } from 'drizzle-orm';

export async function findTaxRateIdByName(name: string): Promise<number> {
  const [row] = await db
    .select({ id: schema.taxRates.id })
    .from(schema.taxRates)
    .where(eq(schema.taxRates.name, name));
  if (!row) {
    throw new Error(`Tax rate not found: ${name} -- run the db seed first`);
  }
  return row.id;
}

export async function deleteCatalogTestData(): Promise<void> {
  const pattern = '\\_\\_catalog\\_test%';
  await db.delete(schema.items).where(like(schema.items.name, pattern));
  await db.delete(schema.subfamilies).where(like(schema.subfamilies.name, pattern));
  await db.delete(schema.families).where(like(schema.families.name, pattern));
  await db.delete(schema.categories).where(like(schema.categories.name, pattern));
}
