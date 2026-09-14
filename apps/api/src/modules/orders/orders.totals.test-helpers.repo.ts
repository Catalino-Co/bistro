import { db, schema } from '@bistro/db';
import { eq, inArray } from 'drizzle-orm';

// Deliberately not the shared `__orders_test_` prefix / deleteOrdersTestData
// sweep from orders.test-helpers.repo.ts: that's a name-pattern wildcard
// delete, and order-lines.routes.test.ts runs concurrently in its own
// vitest worker using that exact same prefix -- a wildcard sweep from here
// would race with (and has raced with) that file's still-in-flight items
// and modifiers. Catalog fixtures aren't branch-scoped, so cleanup here is
// by exact id instead, the same way deleteBranchFixture is id-scoped.
export interface CatalogItemFixture {
  familyId: number;
  subfamilyId: number;
  categoryId: number;
  itemId: number;
}

export async function createCatalogItem(
  suffix: string,
  taxRateId: number,
): Promise<CatalogItemFixture> {
  const [family] = await db
    .insert(schema.families)
    .values({ name: `__order_totals_test_cat_${suffix}__` })
    .returning();
  const [subfamily] = await db
    .insert(schema.subfamilies)
    .values({ familyId: family!.id, name: `__order_totals_test_fam_${suffix}__` })
    .returning();
  const [category] = await db
    .insert(schema.categories)
    .values({ subfamilyId: subfamily!.id, name: `__order_totals_test_sub_${suffix}__` })
    .returning();
  const [item] = await db
    .insert(schema.items)
    .values({
      categoryId: category!.id,
      name: `__order_totals_test_item_${suffix}__`,
      price: '10.0000',
      taxRateId,
    })
    .returning();

  return {
    familyId: family!.id,
    subfamilyId: subfamily!.id,
    categoryId: category!.id,
    itemId: item!.id,
  };
}

export interface ModifierFixture {
  groupId: number;
  modifierId: number;
}

export async function createModifier(
  suffix: string,
  itemId: number,
  priceDelta: string,
): Promise<ModifierFixture> {
  const [group] = await db
    .insert(schema.modifierGroups)
    .values({ name: `__order_totals_test_group_${suffix}__`, selectionType: 'single' })
    .returning();
  const [modifier] = await db
    .insert(schema.modifiers)
    .values({ groupId: group!.id, name: `__order_totals_test_mod_${suffix}__`, priceDelta })
    .returning();
  await db.insert(schema.itemModifierGroups).values({ itemId, modifierGroupId: group!.id });

  return { groupId: group!.id, modifierId: modifier!.id };
}

export async function deleteCatalogFixtures(
  items: CatalogItemFixture[],
  modifier?: ModifierFixture,
): Promise<void> {
  if (modifier) {
    await db
      .delete(schema.itemModifierGroups)
      .where(eq(schema.itemModifierGroups.modifierGroupId, modifier.groupId));
    await db.delete(schema.modifiers).where(eq(schema.modifiers.id, modifier.modifierId));
    await db.delete(schema.modifierGroups).where(eq(schema.modifierGroups.id, modifier.groupId));
  }
  await db.delete(schema.items).where(
    inArray(
      schema.items.id,
      items.map((i) => i.itemId),
    ),
  );
  await db.delete(schema.categories).where(
    inArray(
      schema.categories.id,
      items.map((i) => i.categoryId),
    ),
  );
  await db.delete(schema.subfamilies).where(
    inArray(
      schema.subfamilies.id,
      items.map((i) => i.subfamilyId),
    ),
  );
  await db.delete(schema.families).where(
    inArray(
      schema.families.id,
      items.map((i) => i.familyId),
    ),
  );
}
