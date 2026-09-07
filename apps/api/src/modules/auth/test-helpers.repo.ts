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

  // Sessions reference users with no cascade, so any session left over from
  // a login in the test (e.g. if an assertion failed before logout) would
  // otherwise block this delete.
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));
  await db.delete(schema.users).where(eq(schema.users.id, user.id));
}

export async function closeTestDbPool(): Promise<void> {
  await pool.end();
}
