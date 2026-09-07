import { db, schema } from '@bistro/db';
import { and, count, eq, gte } from 'drizzle-orm';

export interface UserRow {
  id: number;
  username: string;
  passwordHash: string;
  status: 'active' | 'inactive';
  branchId: number | null;
}

export async function findUserByUsername(username: string): Promise<UserRow | null> {
  const [row] = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      passwordHash: schema.users.passwordHash,
      status: schema.users.status,
      branchId: schema.users.branchId,
    })
    .from(schema.users)
    .where(eq(schema.users.username, username));

  return row ?? null;
}

export interface PublicUser {
  id: number;
  username: string;
  fullName: string;
}

export async function findPublicUserById(userId: number): Promise<PublicUser | null> {
  const [row] = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      fullName: schema.users.fullName,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));

  return row ?? null;
}

export async function countRecentFailedLoginAttempts(
  username: string,
  sinceMinutesAgo: number,
): Promise<number> {
  const since = new Date(Date.now() - sinceMinutesAgo * 60 * 1000);
  const [row] = await db
    .select({ value: count() })
    .from(schema.loginAttempts)
    .where(
      and(
        eq(schema.loginAttempts.username, username),
        eq(schema.loginAttempts.succeeded, false),
        gte(schema.loginAttempts.attemptedAt, since),
      ),
    );

  return row?.value ?? 0;
}

export async function recordLoginAttempt(
  username: string,
  succeeded: boolean,
  ipAddress: string | null,
): Promise<void> {
  await db.insert(schema.loginAttempts).values({ username, succeeded, ipAddress });
}
