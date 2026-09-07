import { bigint, jsonb, text, timestamp } from 'drizzle-orm/pg-core';
import { bistro } from './_shared.js';
import { branches } from './org.js';
import { users } from './users.js';

// Backs the Fastify session store (apps/api/src/modules/session). A single
// DB-backed session with expires_at + last_seen_at is the replacement for
// the legacy's two uncoordinated lock mechanisms (a DB flag *and* a flat
// JSON file per order, polled every second, never expiring) -- here there's
// one source of truth, and it can be revoked instantly (delete the row).
export const sessions = bistro.table('sessions', {
  sid: text('sid').primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).references(() => users.id),
  branchId: bigint('branch_id', { mode: 'number' }).references(() => branches.id),
  data: jsonb('data').notNull().$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
