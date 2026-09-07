import { db, schema } from '@bistro/db';
import { eq, inArray, like } from 'drizzle-orm';

// Own "__orders_test_" prefix, distinct from catalog/modifiers test suites'
// own prefixes -- see modifiers.test-helpers.repo.ts for why sharing a
// prefix across suites caused an intermittent cross-suite FK violation.
const PATTERN = '\\_\\_orders\\_test%';

export interface ItemFixture {
  itemId: number;
  categoryId: number;
  familyId: number;
  subfamilyId: number;
}

export async function createItemFixture(suffix: string, taxRateId: number): Promise<ItemFixture> {
  const [category] = await db
    .insert(schema.categories)
    .values({ name: `__orders_test_cat_${suffix}__` })
    .returning();
  const [family] = await db
    .insert(schema.families)
    .values({ categoryId: category!.id, name: `__orders_test_fam_${suffix}__` })
    .returning();
  const [subfamily] = await db
    .insert(schema.subfamilies)
    .values({ familyId: family!.id, name: `__orders_test_sub_${suffix}__` })
    .returning();
  const [item] = await db
    .insert(schema.items)
    .values({
      subfamilyId: subfamily!.id,
      name: `__orders_test_item_${suffix}__`,
      price: '10.0000',
      taxRateId,
    })
    .returning();

  return {
    itemId: item!.id,
    categoryId: category!.id,
    familyId: family!.id,
    subfamilyId: subfamily!.id,
  };
}

export interface ModifierFixture {
  groupId: number;
  modifierId: number;
}

// Associates the new modifier's group with itemId, so it's immediately
// valid to attach to an order line for that item.
export async function createModifierFixture(
  suffix: string,
  itemId: number,
  priceDelta: string,
): Promise<ModifierFixture> {
  const [group] = await db
    .insert(schema.modifierGroups)
    .values({ name: `__orders_test_group_${suffix}__`, selectionType: 'single' })
    .returning();
  const [modifier] = await db
    .insert(schema.modifiers)
    .values({ groupId: group!.id, name: `__orders_test_mod_${suffix}__`, priceDelta })
    .returning();
  await db.insert(schema.itemModifierGroups).values({ itemId, modifierGroupId: group!.id });

  return { groupId: group!.id, modifierId: modifier!.id };
}

export async function findCustomerTypeIdByName(name: string): Promise<number> {
  const [row] = await db
    .select({ id: schema.customerTypes.id })
    .from(schema.customerTypes)
    .where(eq(schema.customerTypes.name, name));
  if (!row) {
    throw new Error(`Customer type not found: ${name} -- run the db seed first`);
  }
  return row.id;
}

export async function createCustomerFixture(
  suffix: string,
  customerTypeId: number,
): Promise<number> {
  const [customer] = await db
    .insert(schema.customers)
    .values({ customerTypeId, name: `__orders_test_customer_${suffix}__` })
    .returning();
  return customer!.id;
}

// ID-scoped (not a wildcard sweep) because dispatch-mode.routes.test.ts
// runs concurrently with order-lines.routes.test.ts, which shares this
// module's "__orders_test_" prefix for its own item/modifier fixtures --
// a wildcard customers delete here is harmless today (no other suite
// creates customers), but a wildcard delete on a table another
// concurrently-running suite is still using is exactly the race that
// deleteOrdersTestData's item/modifier sweep below already hit once.
export async function deleteCustomerFixture(customerId: number): Promise<void> {
  await db.delete(schema.customers).where(eq(schema.customers.id, customerId));
}

export async function deleteOrdersTestData(): Promise<void> {
  const groupIds = (
    await db
      .select({ id: schema.modifierGroups.id })
      .from(schema.modifierGroups)
      .where(like(schema.modifierGroups.name, PATTERN))
  ).map((r) => r.id);
  if (groupIds.length > 0) {
    await db
      .delete(schema.itemModifierGroups)
      .where(inArray(schema.itemModifierGroups.modifierGroupId, groupIds));
    await db.delete(schema.modifiers).where(inArray(schema.modifiers.groupId, groupIds));
    await db.delete(schema.modifierGroups).where(inArray(schema.modifierGroups.id, groupIds));
  }

  await db.delete(schema.items).where(like(schema.items.name, PATTERN));
  await db.delete(schema.subfamilies).where(like(schema.subfamilies.name, PATTERN));
  await db.delete(schema.families).where(like(schema.families.name, PATTERN));
  await db.delete(schema.categories).where(like(schema.categories.name, PATTERN));
}
