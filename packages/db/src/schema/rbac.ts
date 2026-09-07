import { bigint, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { bistro } from './_shared.js';

export const roles = bistro.table('roles', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// `key` is the source of truth referenced both by route guards
// (config.permissions) and by the role-assignment UI -- see
// packages/permissions, which is the single catalog both sides read from.
export const permissions = bistro.table('permissions', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  key: text('key').notNull().unique(),
  description: text('description'),
});

export const rolePermissions = bistro.table(
  'role_permissions',
  {
    roleId: bigint('role_id', { mode: 'number' })
      .notNull()
      .references(() => roles.id),
    permissionId: bigint('permission_id', { mode: 'number' })
      .notNull()
      .references(() => permissions.id),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);

export const rolesRelations = relations(roles, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, {
    fields: [rolePermissions.roleId],
    references: [roles.id],
  }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));
