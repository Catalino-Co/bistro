import { bigint, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { bistro, statusEnum } from './_shared.js';

export const companies = bistro.table('companies', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  taxId: text('tax_id'),
  status: statusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const businessUnits = bistro.table('business_units', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  companyId: bigint('company_id', { mode: 'number' })
    .notNull()
    .references(() => companies.id),
  name: text('name').notNull(),
  status: statusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const branches = bistro.table('branches', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  businessUnitId: bigint('business_unit_id', { mode: 'number' })
    .notNull()
    .references(() => businessUnits.id),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('America/Santo_Domingo'),
  status: statusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const companiesRelations = relations(companies, ({ many }) => ({
  businessUnits: many(businessUnits),
}));

export const businessUnitsRelations = relations(businessUnits, ({ one, many }) => ({
  company: one(companies, {
    fields: [businessUnits.companyId],
    references: [companies.id],
  }),
  branches: many(branches),
}));

export const branchesRelations = relations(branches, ({ one }) => ({
  businessUnit: one(businessUnits, {
    fields: [branches.businessUnitId],
    references: [businessUnits.id],
  }),
}));
