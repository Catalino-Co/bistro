import { db, schema } from '@bistro/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
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

export interface FamilyRow {
  id: number;
  name: string;
  status: 'active' | 'inactive';
  archivedAt: Date | null;
}

const CATEGORY_COLUMNS = {
  id: schema.families.id,
  name: schema.families.name,
  status: schema.families.status,
  archivedAt: schema.families.archivedAt,
};

/**
 * Los cuatro niveles del catalogo comparten estado y filtro. `archived`
 * mira el timestamp; `active`/`inactive` miran el status Y exigen no
 * archivado, porque archivar fuerza inactive y si no un archivado saldria
 * tambien bajo "inactivos".
 */
// `all` no es un estado mas: es la ausencia de filtro. Lo usan los
// selectores de padre de las pantallas del arbol -- para elegir bajo que
// subfamilia va una categoría hace falta ver todas las subfamilias, tambien las
// pausadas y las archivadas, o esas ramas quedan inalcanzables.
export type NodeStatusFilter = 'active' | 'inactive' | 'archived' | 'all';

function statusCondition(
  statusColumn: PgColumn,
  archivedColumn: PgColumn,
  filter: NodeStatusFilter,
) {
  if (filter === 'all') {
    return sql`true`;
  }
  if (filter === 'archived') {
    return sql`${archivedColumn} is not null`;
  }
  return and(eq(statusColumn, filter), isNull(archivedColumn));
}

export async function listFamilies(filter: NodeStatusFilter = 'active'): Promise<FamilyRow[]> {
  return db
    .select(CATEGORY_COLUMNS)
    .from(schema.families)
    .where(statusCondition(schema.families.status, schema.families.archivedAt, filter));
}

export async function createFamily(name: string): Promise<FamilyRow> {
  const [row] = await db.insert(schema.families).values({ name }).returning(CATEGORY_COLUMNS);
  if (!row) throw new Error('Failed to create family');
  return row;
}

export interface SubfamilyRow {
  id: number;
  familyId: number;
  name: string;
  status: 'active' | 'inactive';
  archivedAt: Date | null;
}

const FAMILY_COLUMNS = {
  id: schema.subfamilies.id,
  familyId: schema.subfamilies.familyId,
  name: schema.subfamilies.name,
  status: schema.subfamilies.status,
  archivedAt: schema.subfamilies.archivedAt,
};

export async function listSubfamilies(
  familyId?: number,
  filter: NodeStatusFilter = 'active',
): Promise<SubfamilyRow[]> {
  const conditions = [statusCondition(schema.subfamilies.status, schema.subfamilies.archivedAt, filter)];
  if (familyId !== undefined) {
    conditions.push(eq(schema.subfamilies.familyId, familyId));
  }
  return db
    .select(FAMILY_COLUMNS)
    .from(schema.subfamilies)
    .where(and(...conditions));
}

export async function createSubfamily(familyId: number, name: string): Promise<SubfamilyRow> {
  const [row] = await db
    .insert(schema.subfamilies)
    .values({ familyId, name })
    .returning(FAMILY_COLUMNS);
  if (!row) throw new Error('Failed to create subfamily');
  return row;
}

export interface CategoryRow {
  id: number;
  subfamilyId: number;
  name: string;
  status: 'active' | 'inactive';
  archivedAt: Date | null;
}

const SUBFAMILY_COLUMNS = {
  id: schema.categories.id,
  subfamilyId: schema.categories.subfamilyId,
  name: schema.categories.name,
  status: schema.categories.status,
  archivedAt: schema.categories.archivedAt,
};

export async function listCategories(
  subfamilyId?: number,
  filter: NodeStatusFilter = 'active',
): Promise<CategoryRow[]> {
  const conditions = [
    statusCondition(schema.categories.status, schema.categories.archivedAt, filter),
  ];
  if (subfamilyId !== undefined) {
    conditions.push(eq(schema.categories.subfamilyId, subfamilyId));
  }
  return db
    .select(SUBFAMILY_COLUMNS)
    .from(schema.categories)
    .where(and(...conditions));
}

export async function createCategory(subfamilyId: number, name: string): Promise<CategoryRow> {
  const [row] = await db
    .insert(schema.categories)
    .values({ subfamilyId, name })
    .returning(SUBFAMILY_COLUMNS);
  if (!row) throw new Error('Failed to create category');
  return row;
}

export type TreeLevel = 'family' | 'subfamily' | 'category';

export type TreeNodeRow = {
  id: number;
  name: string;
  status: 'active' | 'inactive';
  archivedAt: Date | null;
};

export type UpdateNodeResult =
  { outcome: 'updated'; node: TreeNodeRow } | { outcome: 'not_found' } | { outcome: 'archived' };

export type ArchiveNodeResult =
  | { outcome: 'archived'; node: TreeNodeRow }
  | { outcome: 'not_found' }
  | { outcome: 'already_archived' };

export type RestoreNodeResult =
  | { outcome: 'restored'; node: TreeNodeRow }
  | { outcome: 'not_found' }
  | { outcome: 'not_archived' };

// Las tres tablas del arbol tienen la misma forma (id, name, status,
// archivedAt) y las mismas reglas, asi que las operaciones se escriben una
// vez y se despachan por nivel. Escribirlas tres veces era la via rapida a
// que una de ellas olvidara la invariante de archivar.
const TREE_TABLES = {
  family: schema.families,
  subfamily: schema.subfamilies,
  category: schema.categories,
} as const;

const TREE_ENTITY: Record<TreeLevel, string> = {
  family: 'family',
  subfamily: 'subfamily',
  category: 'category',
};

function treeColumns(level: TreeLevel) {
  const table = TREE_TABLES[level];
  return { id: table.id, name: table.name, status: table.status, archivedAt: table.archivedAt };
}

async function readNode(level: TreeLevel, id: number): Promise<TreeNodeRow | undefined> {
  const [row] = await db
    .select(treeColumns(level))
    .from(TREE_TABLES[level])
    .where(eq(TREE_TABLES[level].id, id));
  return row;
}

export async function updateTreeNode(
  level: TreeLevel,
  id: number,
  patch: { name?: string | undefined; status?: ('active' | 'inactive') | undefined },
  actorUserId: number,
  branchId?: number,
): Promise<UpdateNodeResult> {
  const before = await readNode(level, id);
  if (!before) return { outcome: 'not_found' };
  if (before.archivedAt !== null) return { outcome: 'archived' };

  const values: { name?: string; status?: 'active' | 'inactive' } = {};
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.status !== undefined) values.status = patch.status;
  if (Object.keys(values).length === 0) return { outcome: 'updated', node: before };

  const [row] = await db
    .update(TREE_TABLES[level])
    .set(values)
    .where(eq(TREE_TABLES[level].id, id))
    .returning(treeColumns(level));
  if (!row) throw new Error(`Failed to update ${level}`);

  const previous: Record<string, unknown> = {};
  for (const key of Object.keys(values)) {
    previous[key] = before[key as keyof TreeNodeRow];
  }
  await recordAuditEvent({
    actionKey: `catalog.${level}_updated`,
    entityType: TREE_ENTITY[level],
    entityId: String(id),
    beforeData: previous,
    afterData: values,
    userId: actorUserId,
    branchId,
  });
  return { outcome: 'updated', node: row };
}

/**
 * Archivar un nivel del arbol no escribe nada en sus hijos: lo que los saca
 * del POS es que el picker exige toda la ascendencia vendible. Restaurar
 * devuelve entonces el estado exacto que cada hijo tenia.
 */
export async function archiveTreeNode(
  level: TreeLevel,
  id: number,
  actorUserId: number,
  branchId?: number,
): Promise<ArchiveNodeResult> {
  const before = await readNode(level, id);
  if (!before) return { outcome: 'not_found' };
  if (before.archivedAt !== null) return { outcome: 'already_archived' };

  const [row] = await db
    .update(TREE_TABLES[level])
    // Misma invariante que en items: el timestamp va acompanado de
    // status = 'inactive' para que una consulta que solo mire el status
    // siga excluyendo lo archivado.
    .set({ archivedAt: new Date(), status: 'inactive' })
    .where(eq(TREE_TABLES[level].id, id))
    .returning(treeColumns(level));
  if (!row) throw new Error(`Failed to archive ${level}`);

  await recordAuditEvent({
    actionKey: `catalog.${level}_archived`,
    entityType: TREE_ENTITY[level],
    entityId: String(id),
    beforeData: { archivedAt: null, status: before.status },
    afterData: { archivedAt: row.archivedAt?.toISOString(), status: 'inactive' },
    userId: actorUserId,
    branchId,
  });
  return { outcome: 'archived', node: row };
}

export async function restoreTreeNode(
  level: TreeLevel,
  id: number,
  actorUserId: number,
  branchId?: number,
): Promise<RestoreNodeResult> {
  const before = await readNode(level, id);
  if (!before) return { outcome: 'not_found' };
  if (before.archivedAt === null) return { outcome: 'not_archived' };

  const [row] = await db
    .update(TREE_TABLES[level])
    .set({ archivedAt: null, status: 'inactive' })
    .where(eq(TREE_TABLES[level].id, id))
    .returning(treeColumns(level));
  if (!row) throw new Error(`Failed to restore ${level}`);

  await recordAuditEvent({
    actionKey: `catalog.${level}_restored`,
    entityType: TREE_ENTITY[level],
    entityId: String(id),
    beforeData: { archivedAt: before.archivedAt.toISOString() },
    afterData: { archivedAt: null, status: 'inactive' },
    userId: actorUserId,
    branchId,
  });
  return { outcome: 'restored', node: row };
}

export interface ItemRow {
  id: number;
  categoryId: number;
  name: string;
  price: string;
  taxRateId: number;
  stationId: number | null;
  status: 'active' | 'inactive';
  archivedAt: Date | null;
}

const ITEM_COLUMNS = {
  id: schema.items.id,
  categoryId: schema.items.categoryId,
  name: schema.items.name,
  price: schema.items.price,
  taxRateId: schema.items.taxRateId,
  stationId: schema.items.stationId,
  usesModifiers: schema.items.usesModifiers,
  status: schema.items.status,
  archivedAt: schema.items.archivedAt,
};

// Lo unico que se puede vender: activo Y no archivado. Definido una sola vez
// para que ningun sitio se quede con media condicion.
const sellableItem = and(eq(schema.items.status, 'active'), isNull(schema.items.archivedAt));

// Lo mismo, extendido a los tres niveles de arriba. Solo se usa donde hay
// join hasta categorias (el picker del POS y el guard de addOrderLine).
const sellableWithAncestry = and(
  sellableItem,
  eq(schema.categories.status, 'active'),
  isNull(schema.categories.archivedAt),
  eq(schema.subfamilies.status, 'active'),
  isNull(schema.subfamilies.archivedAt),
  eq(schema.families.status, 'active'),
  isNull(schema.families.archivedAt),
);

/**
 * Si un item se puede vender hoy, mirando tambien su ascendencia. Lo usa el
 * guard de addOrderLine, que sin esto aceptaria un item cuya categoria se
 * acaba de archivar solo porque el item en si sigue activo.
 */
export async function isItemSellable(itemId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.items.id })
    .from(schema.items)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.items.categoryId))
    .innerJoin(schema.subfamilies, eq(schema.subfamilies.id, schema.categories.subfamilyId))
    .innerJoin(schema.families, eq(schema.families.id, schema.subfamilies.familyId))
    .where(and(eq(schema.items.id, itemId), sellableWithAncestry));
  return row !== undefined;
}

/** Si el padre esta archivado, no se le pueden colgar hijos nuevos. */
export async function isFamilyArchived(id: number): Promise<boolean> {
  const [row] = await db
    .select({ archivedAt: schema.families.archivedAt })
    .from(schema.families)
    .where(eq(schema.families.id, id));
  return row?.archivedAt != null;
}

export async function isSubfamilyArchived(id: number): Promise<boolean> {
  const [row] = await db
    .select({ archivedAt: schema.subfamilies.archivedAt })
    .from(schema.subfamilies)
    .where(eq(schema.subfamilies.id, id));
  return row?.archivedAt != null;
}

export async function isCategoryArchived(id: number): Promise<boolean> {
  const [row] = await db
    .select({ archivedAt: schema.categories.archivedAt })
    .from(schema.categories)
    .where(eq(schema.categories.id, id));
  return row?.archivedAt != null;
}

export type ItemStatusFilter = 'active' | 'inactive' | 'archived';

function itemStatusCondition(filter: ItemStatusFilter) {
  if (filter === 'archived') {
    return sql`${schema.items.archivedAt} is not null`;
  }
  return and(eq(schema.items.status, filter), isNull(schema.items.archivedAt));
}

export async function listItems(
  categoryId?: number,
  filter: ItemStatusFilter = 'active',
): Promise<ItemRow[]> {
  const conditions = [itemStatusCondition(filter)];
  if (categoryId !== undefined) {
    conditions.push(eq(schema.items.categoryId, categoryId));
  }
  return db
    .select(ITEM_COLUMNS)
    .from(schema.items)
    .where(and(...conditions));
}

export interface ItemWithFamilyRow extends ItemRow {
  familyId: number;
  familyName: string;
}

// Joins up to the family so the POS can group its item picker without
// an N+1 fetch per family/subfamily/category -- additive alongside
// listItems (which stays as-is for admin/catalog's drill-down browsing).
export async function listItemsWithFamily(): Promise<ItemWithFamilyRow[]> {
  return (
    db
      .select({
        ...ITEM_COLUMNS,
        familyId: schema.families.id,
        familyName: schema.families.name,
      })
      .from(schema.items)
      .innerJoin(schema.categories, eq(schema.categories.id, schema.items.categoryId))
      .innerJoin(schema.subfamilies, eq(schema.subfamilies.id, schema.categories.subfamilyId))
      .innerJoin(schema.families, eq(schema.families.id, schema.subfamilies.familyId))
      // El picker solo ofrece lo vendible, y vendible es el item Y toda su
      // ascendencia: archivar una categoria saca del POS todo lo que cuelga
      // de ella sin escribir una sola fila en sus hijos.
      //
      // Ojo: esto es lo que obliga a que la pantalla del POS lea el nombre de
      // una linea de `line.itemName` (que viene de la API) y no de este
      // array, o una linea de un item archivado se quedaria sin nombre.
      .where(sellableWithAncestry)
  );
}

export async function createItem(
  categoryId: number,
  name: string,
  price: string,
  taxRateId: number,
  stationId?: number,
): Promise<ItemRow> {
  const [row] = await db
    .insert(schema.items)
    .values({ categoryId, name, price, taxRateId, stationId: stationId ?? null })
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
  usesModifiers?: boolean | undefined;
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
    if (patch.usesModifiers !== undefined) values.usesModifiers = patch.usesModifiers;
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
