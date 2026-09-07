import { bigint, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { bistro, statusEnum } from './_shared.js';
import { branches } from './org.js';
import { roles } from './rbac.js';

export const users = bistro.table('users', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  // Home/default branch. Nullable: a corporate-level user isn't tied to one
  // branch; per-branch role assignment lives in user_roles below.
  branchId: bigint('branch_id', { mode: 'number' }).references(() => branches.id),
  fullName: text('full_name').notNull(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  // Argon2id hash of this user's own manager-override PIN. Nullable: not
  // every user is authorized to perform PIN overrides.
  pinHash: text('pin_hash'),
  status: statusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// A role assignment is scoped to one branch, so the same login can be a
// cashier at branch A and a manager at branch B.
export const userRoles = bistro.table(
  'user_roles',
  {
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id),
    roleId: bigint('role_id', { mode: 'number' })
      .notNull()
      .references(() => roles.id),
    branchId: bigint('branch_id', { mode: 'number' })
      .notNull()
      .references(() => branches.id),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleId, table.branchId] })],
);

export const usersRelations = relations(users, ({ one, many }) => ({
  homeBranch: one(branches, {
    fields: [users.branchId],
    references: [branches.id],
  }),
  userRoles: many(userRoles),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
  branch: one(branches, {
    fields: [userRoles.branchId],
    references: [branches.id],
  }),
}));
