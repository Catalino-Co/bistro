import { bigint, numeric, primaryKey, text } from 'drizzle-orm/pg-core';
import { bistro } from './_shared.js';
import { items } from './menu.js';

export const modifierSelectionTypeEnum = bistro.enum('modifier_selection_type', [
  'single',
  'multiple',
]);

// price_delta is the direct fix for the legacy's garnitures/cook_terms
// having no price column at all -- an extra could never be charged for.
export const modifierGroups = bistro.table('modifier_groups', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  selectionType: modifierSelectionTypeEnum('selection_type').notNull().default('single'),
});

export const modifiers = bistro.table('modifiers', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  groupId: bigint('group_id', { mode: 'number' })
    .notNull()
    .references(() => modifierGroups.id),
  name: text('name').notNull(),
  priceDelta: numeric('price_delta', { precision: 12, scale: 4 }).notNull().default('0'),
});

export const itemModifierGroups = bistro.table(
  'item_modifier_groups',
  {
    itemId: bigint('item_id', { mode: 'number' })
      .notNull()
      .references(() => items.id),
    modifierGroupId: bigint('modifier_group_id', { mode: 'number' })
      .notNull()
      .references(() => modifierGroups.id),
  },
  (table) => [primaryKey({ columns: [table.itemId, table.modifierGroupId] })],
);
