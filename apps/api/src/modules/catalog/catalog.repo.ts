import { db, schema } from '@bistro/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { recordAuditEvent } from '../audit/audit.repo.js';

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
  stationId: number | null;
  status: 'active' | 'inactive';
  archivedAt: Date | null;
}

const ITEM_COLUMNS = {
  id: schema.items.id,
  subfamilyId: schema.items.subfamilyId,
  name: schema.items.name,
  price: schema.items.price,
  taxRateId: schema.items.taxRateId,
  stationId: schema.items.stationId,
  status: schema.items.status,
  archivedAt: schema.items.archivedAt,
};

// Lo unico que se puede vender: activo Y no archivado. Definido una sola vez
// para que ningun sitio se quede con media condicion.
const sellableItem = and(eq(schema.items.status, 'active'), isNull(schema.items.archivedAt));

export type ItemStatusFilter = 'active' | 'inactive' | 'archived';

function itemStatusCondition(filter: ItemStatusFilter) {
  if (filter === 'archived') {
    return sql`${schema.items.archivedAt} is not null`;
  }
  return and(eq(schema.items.status, filter), isNull(schema.items.archivedAt));
}

export async function listItems(
  subfamilyId?: number,
  filter: ItemStatusFilter = 'active',
): Promise<ItemRow[]> {
  const conditions = [itemStatusCondition(filter)];
  if (subfamilyId !== undefined) {
    conditions.push(eq(schema.items.subfamilyId, subfamilyId));
  }
  return db
    .select(ITEM_COLUMNS)
    .from(schema.items)
    .where(and(...conditions));
}

export interface ItemWithCategoryRow extends ItemRow {
  categoryId: number;
  categoryName: string;
}

// Joins up to the category so the POS can group its item picker without
// an N+1 fetch per category/family/subfamily -- additive alongside
// listItems (which stays as-is for admin/catalog's drill-down browsing).
export async function listItemsWithCategory(): Promise<ItemWithCategoryRow[]> {
  return (
    db
      .select({
        ...ITEM_COLUMNS,
        categoryId: schema.categories.id,
        categoryName: schema.categories.name,
      })
      .from(schema.items)
      .innerJoin(schema.subfamilies, eq(schema.subfamilies.id, schema.items.subfamilyId))
      .innerJoin(schema.families, eq(schema.families.id, schema.subfamilies.familyId))
      .innerJoin(schema.categories, eq(schema.categories.id, schema.families.categoryId))
      // El picker solo ofrece lo vendible. Ojo: esto es lo que obliga a que la
      // pantalla del POS lea el nombre de una linea de `line.itemName` (que
      // viene de la API) y no de este array, o una linea de un item archivado
      // se quedaria sin nombre.
      .where(sellableItem)
  );
}

export async function createItem(
  subfamilyId: number,
  name: string,
  price: string,
  taxRateId: number,
  stationId?: number,
): Promise<ItemRow> {
  const [row] = await db
    .insert(schema.items)
    .values({ subfamilyId, name, price, taxRateId, stationId: stationId ?? null })
    .returning(ITEM_COLUMNS);
  if (!row) throw new Error('Failed to create item');
  return row;
}

export type UpdateItemResult =
  | { outcome: 'updated'; item: ItemRow }
  | { outcome: 'item_not_found' }
  | { outcome: 'item_archived' }
  | { outcome: 'tax_rate_not_found' };

export interface ItemPatch {
  name?: string | undefined;
  price?: string | undefined;
  taxRateId?: number | undefined;
  status?: ('active' | 'inactive') | undefined;
}

/**
 * Editar un item. Hasta ahora no existia ninguna forma de hacerlo: ni el
 * nombre, ni el precio, ni el impuesto.
 *
 * Cambiar el precio es seguro para el historial -- `order_lines.unit_price`
 * guarda el precio del momento de la venta -- pero el cambio se audita con el
 * valor anterior, que es lo que lo hace reversible a mano.
 *
 * La estacion no se toca aqui: ya tiene su propia ruta y su propia pestana.
 */
export async function updateItem(
  itemId: number,
  patch: ItemPatch,
  actorUserId: number,
  branchId?: number,
): Promise<UpdateItemResult> {
  const result = await db.transaction(async (tx) => {
    const [before] = await tx
      .select(ITEM_COLUMNS)
      .from(schema.items)
      .where(eq(schema.items.id, itemId))
      .for('update');
    if (!before) return { outcome: 'item_not_found' as const };
    if (before.archivedAt !== null) return { outcome: 'item_archived' as const };

    if (patch.taxRateId !== undefined) {
      const [taxRate] = await tx
        .select({ id: schema.taxRates.id })
        .from(schema.taxRates)
        .where(eq(schema.taxRates.id, patch.taxRateId));
      // Sin esta comprobacion un id inexistente sale como un 500 por violacion
      // de FK, que no le dice nada a quien esta usando la pantalla.
      if (!taxRate) return { outcome: 'tax_rate_not_found' as const };
    }

    // Solo las claves que vienen definidas: pasar `undefined` a `.set()` no es
    // lo mismo que omitir la columna, y un patch vacio genera SQL invalido.
    const values: Partial<typeof schema.items.$inferInsert> = {};
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.price !== undefined) values.price = patch.price;
    if (patch.taxRateId !== undefined) values.taxRateId = patch.taxRateId;
    if (patch.status !== undefined) values.status = patch.status;
    if (Object.keys(values).length === 0) {
      return { outcome: 'noop' as const, item: before };
    }

    const [row] = await tx
      .update(schema.items)
      .set(values)
      .where(eq(schema.items.id, itemId))
      .returning(ITEM_COLUMNS);
    if (!row) throw new Error('Failed to update item');

    // La imagen previa, recortada a lo que de verdad cambio: eso es lo que
    // hace que un cambio de precio se pueda deshacer leyendo la bitacora.
    const previous: Record<string, unknown> = {};
    for (const key of Object.keys(values)) {
      previous[key] = before[key as keyof ItemRow];
    }
    return { outcome: 'changed' as const, item: row, changed: values, previous };
  });

  if (result.outcome === 'changed') {
    await recordAuditEvent({
      actionKey: 'catalog.item_updated',
      entityType: 'item',
      entityId: String(itemId),
      beforeData: result.previous,
      afterData: result.changed as Record<string, unknown>,
      userId: actorUserId,
      branchId,
    });
    return { outcome: 'updated', item: result.item };
  }
  if (result.outcome === 'noop') {
    return { outcome: 'updated', item: result.item };
  }
  return { outcome: result.outcome };
}

export type ArchiveItemResult =
  | { outcome: 'archived'; item: ItemRow }
  | { outcome: 'item_not_found' }
  | { outcome: 'already_archived' };

/**
 * Archivar: el item sale del POS y del catalogo, pero la fila se queda. Nada
 * de DELETE -- `order_lines` la referencia y borrarla seria borrar historial
 * de ventas.
 */
export async function archiveItem(
  itemId: number,
  actorUserId: number,
  branchId?: number,
): Promise<ArchiveItemResult> {
  const result = await db.transaction(async (tx) => {
    const [before] = await tx
      .select(ITEM_COLUMNS)
      .from(schema.items)
      .where(eq(schema.items.id, itemId))
      .for('update');
    if (!before) return { outcome: 'item_not_found' as const };
    if (before.archivedAt !== null) return { outcome: 'already_archived' as const };

    const [row] = await tx
      .update(schema.items)
      // `status = 'inactive'` junto al timestamp: ver la invariante en el
      // esquema. Es lo que hace que una consulta que solo mire el status siga
      // excluyendo lo archivado.
      .set({ archivedAt: new Date(), status: 'inactive' })
      .where(eq(schema.items.id, itemId))
      .returning(ITEM_COLUMNS);
    if (!row) throw new Error('Failed to archive item');
    return { outcome: 'archived' as const, item: row, previousStatus: before.status };
  });

  if (result.outcome === 'archived') {
    await recordAuditEvent({
      actionKey: 'catalog.item_archived',
      entityType: 'item',
      entityId: String(itemId),
      beforeData: { archivedAt: null, status: result.previousStatus },
      afterData: { archivedAt: result.item.archivedAt?.toISOString(), status: 'inactive' },
      userId: actorUserId,
      branchId,
    });
    return { outcome: 'archived', item: result.item };
  }
  return { outcome: result.outcome };
}

export type RestoreItemResult =
  | { outcome: 'restored'; item: ItemRow }
  | { outcome: 'item_not_found' }
  | { outcome: 'not_archived' };

/**
 * Restaurar deja el item INACTIVO a proposito: vuelve al catalogo, no a la
 * venta. Volver a ponerlo a la carta es un clic aparte, porque el precio puede
 * llevar un ano sin mirarse.
 */
export async function restoreItem(
  itemId: number,
  actorUserId: number,
  branchId?: number,
): Promise<RestoreItemResult> {
  const result = await db.transaction(async (tx) => {
    const [before] = await tx
      .select(ITEM_COLUMNS)
      .from(schema.items)
      .where(eq(schema.items.id, itemId))
      .for('update');
    if (!before) return { outcome: 'item_not_found' as const };
    if (before.archivedAt === null) return { outcome: 'not_archived' as const };

    const [row] = await tx
      .update(schema.items)
      .set({ archivedAt: null, status: 'inactive' })
      .where(eq(schema.items.id, itemId))
      .returning(ITEM_COLUMNS);
    if (!row) throw new Error('Failed to restore item');
    return { outcome: 'restored' as const, item: row, previousArchivedAt: before.archivedAt };
  });

  if (result.outcome === 'restored') {
    await recordAuditEvent({
      actionKey: 'catalog.item_restored',
      entityType: 'item',
      entityId: String(itemId),
      beforeData: { archivedAt: result.previousArchivedAt.toISOString() },
      afterData: { archivedAt: null, status: 'inactive' },
      userId: actorUserId,
      branchId,
    });
    return { outcome: 'restored', item: result.item };
  }
  return { outcome: result.outcome };
}

export async function updateItemStation(itemId: number, stationId: number | null): Promise<void> {
  await db.update(schema.items).set({ stationId }).where(eq(schema.items.id, itemId));
}

export interface KitchenStationRow {
  id: number;
  name: string;
  printerHost: string | null;
  printerPort: number | null;
  status: 'active' | 'inactive';
}

export async function listKitchenStations(): Promise<KitchenStationRow[]> {
  return db
    .select({
      id: schema.kitchenStations.id,
      name: schema.kitchenStations.name,
      printerHost: schema.kitchenStations.printerHost,
      printerPort: schema.kitchenStations.printerPort,
      status: schema.kitchenStations.status,
    })
    .from(schema.kitchenStations);
}

export async function createKitchenStation(
  name: string,
  printerHost?: string,
  printerPort?: number,
): Promise<KitchenStationRow> {
  const [row] = await db
    .insert(schema.kitchenStations)
    .values({
      name,
      printerHost: printerHost ?? null,
      printerPort: printerPort ?? null,
    })
    .returning();
  if (!row) throw new Error('Failed to create kitchen station');
  return row;
}

export async function updateKitchenStationPrinter(
  id: number,
  printerHost: string | null,
  printerPort: number | null,
): Promise<void> {
  await db
    .update(schema.kitchenStations)
    .set({ printerHost, printerPort })
    .where(eq(schema.kitchenStations.id, id));
}
