import { db, schema } from '@bistro/db';
import { inArray, like } from 'drizzle-orm';

// The beforeAll in modifiers.routes.test.ts creates its own modifier
// groups/modifiers AND its own family -> subfamily -> category -> item
// chain, all under this one "__modifiers_test_" prefix -- distinct from
// catalog.routes.test.ts's "__catalog_test_" prefix, so the two suites'
// cleanups never race over the same rows (they did, before this split:
// both patterns matched "__catalog_test_mod_*" names, and one suite's
// cleanup deleting an item the other suite's test was still using
// surfaced as a 500 on the item_modifier_groups insert).
const PATTERN = '\\_\\_modifiers\\_test%';

export async function deleteModifiersTestData(): Promise<void> {
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
  await db.delete(schema.categories).where(like(schema.categories.name, PATTERN));
  await db.delete(schema.subfamilies).where(like(schema.subfamilies.name, PATTERN));
  await db.delete(schema.families).where(like(schema.families.name, PATTERN));
}
