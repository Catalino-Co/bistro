import { db, schema } from '@bistro/db';
import { eq } from 'drizzle-orm';

export interface DineAreaRow {
  id: number;
  branchId: number;
  name: string;
}

export async function listDineAreas(branchId: number): Promise<DineAreaRow[]> {
  return db
    .select({
      id: schema.dineAreas.id,
      branchId: schema.dineAreas.branchId,
      name: schema.dineAreas.name,
    })
    .from(schema.dineAreas)
    .where(eq(schema.dineAreas.branchId, branchId));
}

export async function createDineArea(branchId: number, name: string): Promise<DineAreaRow> {
  const [row] = await db.insert(schema.dineAreas).values({ branchId, name }).returning();
  if (!row) throw new Error('Failed to create dine area');
  return row;
}

export async function updateDineArea(id: number, name: string): Promise<void> {
  await db.update(schema.dineAreas).set({ name }).where(eq(schema.dineAreas.id, id));
}

export async function deleteDineArea(id: number): Promise<void> {
  await db.delete(schema.dineAreas).where(eq(schema.dineAreas.id, id));
}

export interface DineTableRow {
  id: number;
  dineAreaId: number;
  name: string;
  seats: number;
  status: 'available' | 'occupied' | 'reserved';
}

export async function listDineTables(dineAreaId: number): Promise<DineTableRow[]> {
  return db
    .select({
      id: schema.dineTables.id,
      dineAreaId: schema.dineTables.dineAreaId,
      name: schema.dineTables.name,
      seats: schema.dineTables.seats,
      status: schema.dineTables.status,
    })
    .from(schema.dineTables)
    .where(eq(schema.dineTables.dineAreaId, dineAreaId));
}

export async function createDineTable(
  dineAreaId: number,
  name: string,
  seats: number,
): Promise<DineTableRow> {
  const [row] = await db.insert(schema.dineTables).values({ dineAreaId, name, seats }).returning();
  if (!row) throw new Error('Failed to create table');
  return row;
}

export async function updateDineTable(id: number, name: string, seats: number): Promise<void> {
  await db.update(schema.dineTables).set({ name, seats }).where(eq(schema.dineTables.id, id));
}

export async function deleteDineTable(id: number): Promise<void> {
  await db.delete(schema.dineTables).where(eq(schema.dineTables.id, id));
}
