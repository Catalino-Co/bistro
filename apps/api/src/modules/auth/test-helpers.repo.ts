import { db, pool, schema } from '@bistro/db';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';

export async function createTestUser(username: string, password: string): Promise<number> {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const [row] = await db
    .insert(schema.users)
    .values({ username, fullName: 'Test User', passwordHash })
    .returning({ id: schema.users.id });

  if (!row) {
    throw new Error('Failed to create test user');
  }
  return row.id;
}

export async function deleteTestUser(username: string): Promise<void> {
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.username, username));

  if (!user) {
    return;
  }

  // Sessions and audit_log both reference users with no cascade, so any
  // session or audit event left over from the test (logins, guard denials,
  // rbac changes) would otherwise block this delete.
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));
  await db.delete(schema.auditLog).where(eq(schema.auditLog.userId, user.id));
  await db.delete(schema.users).where(eq(schema.users.id, user.id));
}

export async function deleteLoginAttempts(username: string): Promise<void> {
  await db.delete(schema.loginAttempts).where(eq(schema.loginAttempts.username, username));
}

export async function closeTestDbPool(): Promise<void> {
  await pool.end();
}
