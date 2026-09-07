import { db, schema } from '@bistro/db';
import { eq } from 'drizzle-orm';

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
