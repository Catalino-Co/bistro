import { bigint, index, jsonb, text, timestamp } from 'drizzle-orm/pg-core';
import { bistro } from './_shared.js';
import { branches } from './org.js';
import { users } from './users.js';

// Generic, single-table audit trail written through one helper
// (modules/audit/audit.repo.ts) rather than left to per-endpoint
// discipline -- the legacy's one audit mechanism (logs_invoices) was
// silently broken (the INSERT was prepared but never executed) and
// every other audit table (logs_crud, action_logs, user_histories)
// existed unused. `before`/`after` capture enough to reconstruct what
// changed without a bespoke column set per action type.
export const auditLog = bistro.table(
  'audit_log',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    actionKey: text('action_key').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    beforeData: jsonb('before_data').$type<Record<string, unknown>>(),
    afterData: jsonb('after_data').$type<Record<string, unknown>>(),
    userId: bigint('user_id', { mode: 'number' }).references(() => users.id),
    branchId: bigint('branch_id', { mode: 'number' }).references(() => branches.id),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_log_action_key_created_at_idx').on(table.actionKey, table.createdAt),
    index('audit_log_entity_type_entity_id_idx').on(table.entityType, table.entityId),
  ],
);
