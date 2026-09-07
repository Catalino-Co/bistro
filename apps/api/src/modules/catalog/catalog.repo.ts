import { db, schema } from '@bistro/db';
import { eq } from 'drizzle-orm';

export interface TaxRateRow {
  id: number;
  name: string;
  rate: string;
}

export async function listTaxRates(): Promise<TaxRateRow[]> {
  return db
    .select({ id: schema.taxRates.id, name: schema.taxRates.name, rate: schema.taxRates.rate })
    .from(schema.taxRates);
}

export interface CategoryRow {
  id: number;
  name: string;
  status: 'active' | 'inactive';
}

export async function listCategories(): Promise<CategoryRow[]> {
  return db
    .select({
      id: schema.categories.id,
      name: schema.categories.name,
      status: schema.categories.status,
    })
    .from(schema.categories);
}

export async function createCategory(name: string): Promise<CategoryRow> {
  const [row] = await db.insert(schema.categories).values({ name }).returning();
  if (!row) throw new Error('Failed to create category');
  return row;
}

export interface FamilyRow {
  id: number;
  categoryId: number;
  name: string;
  status: 'active' | 'inactive';
}

export async function listFamilies(categoryId?: number): Promise<FamilyRow[]> {
  const query = db
    .select({
      id: schema.families.id,
      categoryId: schema.families.categoryId,
      name: schema.families.name,
      status: schema.families.status,
    })
    .from(schema.families);
  return categoryId !== undefined ? query.where(eq(schema.families.categoryId, categoryId)) : query;
}

export async function createFamily(categoryId: number, name: string): Promise<FamilyRow> {
  const [row] = await db.insert(schema.families).values({ categoryId, name }).returning();
  if (!row) throw new Error('Failed to create family');
  return row;
}

export interface SubfamilyRow {
  id: number;
  familyId: number;
  name: string;
  status: 'active' | 'inactive';
}

export async function listSubfamilies(familyId?: number): Promise<SubfamilyRow[]> {
  const query = db
    .select({
      id: schema.subfamilies.id,
      familyId: schema.subfamilies.familyId,
      name: schema.subfamilies.name,
      status: schema.subfamilies.status,
    })
    .from(schema.subfamilies);
  return familyId !== undefined ? query.where(eq(schema.subfamilies.familyId, familyId)) : query;
}

export async function createSubfamily(familyId: number, name: string): Promise<SubfamilyRow> {
  const [row] = await db.insert(schema.subfamilies).values({ familyId, name }).returning();
  if (!row) throw new Error('Failed to create subfamily');
  return row;
}

export interface ItemRow {
  id: number;
  subfamilyId: number;
  name: string;
  price: string;
  taxRateId: number;
  status: 'active' | 'inactive';
}

export async function listItems(subfamilyId?: number): Promise<ItemRow[]> {
  const query = db
    .select({
      id: schema.items.id,
      subfamilyId: schema.items.subfamilyId,
      name: schema.items.name,
      price: schema.items.price,
      taxRateId: schema.items.taxRateId,
      status: schema.items.status,
    })
    .from(schema.items);
  return subfamilyId !== undefined ? query.where(eq(schema.items.subfamilyId, subfamilyId)) : query;
}

export async function createItem(
  subfamilyId: number,
  name: string,
  price: string,
  taxRateId: number,
): Promise<ItemRow> {
  const [row] = await db
    .insert(schema.items)
    .values({ subfamilyId, name, price, taxRateId })
    .returning();
  if (!row) throw new Error('Failed to create item');
  return row;
}
