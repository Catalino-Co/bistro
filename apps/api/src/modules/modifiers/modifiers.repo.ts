import { db, schema } from '@bistro/db';
import { and, eq } from 'drizzle-orm';

export interface ModifierGroupRow {
  id: number;
  name: string;
  selectionType: 'single' | 'multiple';
}

export async function listModifierGroups(): Promise<ModifierGroupRow[]> {
  return db
    .select({
      id: schema.modifierGroups.id,
      name: schema.modifierGroups.name,
      selectionType: schema.modifierGroups.selectionType,
    })
    .from(schema.modifierGroups);
}

export async function createModifierGroup(
  name: string,
  selectionType: 'single' | 'multiple',
): Promise<ModifierGroupRow> {
  const [row] = await db.insert(schema.modifierGroups).values({ name, selectionType }).returning();
  if (!row) throw new Error('Failed to create modifier group');
  return row;
}

export interface ModifierRow {
  id: number;
  groupId: number;
  name: string;
  priceDelta: string;
}

export async function listModifiers(groupId?: number): Promise<ModifierRow[]> {
  const query = db
    .select({
      id: schema.modifiers.id,
      groupId: schema.modifiers.groupId,
      name: schema.modifiers.name,
      priceDelta: schema.modifiers.priceDelta,
    })
    .from(schema.modifiers);
  return groupId !== undefined ? query.where(eq(schema.modifiers.groupId, groupId)) : query;
}

export async function createModifier(
  groupId: number,
  name: string,
  priceDelta: string,
): Promise<ModifierRow> {
  const [row] = await db.insert(schema.modifiers).values({ groupId, name, priceDelta }).returning();
  if (!row) throw new Error('Failed to create modifier');
  return row;
}

export async function listModifierGroupsForItem(itemId: number): Promise<ModifierGroupRow[]> {
  return db
    .select({
      id: schema.modifierGroups.id,
      name: schema.modifierGroups.name,
      selectionType: schema.modifierGroups.selectionType,
    })
    .from(schema.itemModifierGroups)
    .innerJoin(
      schema.modifierGroups,
      eq(schema.modifierGroups.id, schema.itemModifierGroups.modifierGroupId),
    )
    .where(eq(schema.itemModifierGroups.itemId, itemId));
}

export async function associateModifierGroupWithItem(
  itemId: number,
  modifierGroupId: number,
): Promise<void> {
  await db
    .insert(schema.itemModifierGroups)
    .values({ itemId, modifierGroupId })
    .onConflictDoNothing();
}

/**
 * Quitarle un grupo a un item. Hasta ahora solo se podia asociar, asi que un
 * grupo puesto por error se quedaba para siempre -- y "no todos los items
 * llevan los mismos modificadores" exige poder deshacerlo.
 *
 * Esto SI es un DELETE de verdad, y es la excepcion que confirma la regla de
 * no borrar: `item_modifier_groups` no es historial, es configuracion. Lo que
 * de verdad se pidio vive en `order_line_modifiers`, que copia nombre y
 * precio al momento de la venta y no depende de esta fila.
 */
export async function disassociateModifierGroupFromItem(
  itemId: number,
  modifierGroupId: number,
): Promise<void> {
  await db
    .delete(schema.itemModifierGroups)
    .where(
      and(
        eq(schema.itemModifierGroups.itemId, itemId),
        eq(schema.itemModifierGroups.modifierGroupId, modifierGroupId),
      ),
    );
}
