import { bigint, boolean, index, jsonb, text, timestamp } from 'drizzle-orm/pg-core';
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

// One row per login attempt (by username, not user_id -- an attempt against
// a nonexistent username is still worth recording). The lockout check in
// auth.service.ts counts recent failures in a sliding window; the legacy
// had zero rate limiting or lockout on login at all.
export const loginAttempts = bistro.table(
  'login_attempts',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    username: text('username').notNull(),
    succeeded: boolean('succeeded').notNull(),
    ipAddress: text('ip_address'),
    attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('login_attempts_username_attempted_at_idx').on(table.username, table.attemptedAt),
  ],
);
