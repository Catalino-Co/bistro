import { db, schema } from '@bistro/db';
import { eq, lt } from 'drizzle-orm';

export interface SessionRow {
  sid: string;
  data: Record<string, unknown>;
}

export async function findSession(sid: string): Promise<SessionRow | null> {
  const [row] = await db
    .select({ sid: schema.sessions.sid, data: schema.sessions.data })
    .from(schema.sessions)
    .where(eq(schema.sessions.sid, sid));

  return row ?? null;
}

export async function upsertSession(
  sid: string,
  data: Record<string, unknown>,
  expiresAt: Date,
): Promise<void> {
  const userId = typeof data.userId === 'number' ? data.userId : null;
  const branchId = typeof data.branchId === 'number' ? data.branchId : null;

  await db
    .insert(schema.sessions)
    .values({ sid, data, expiresAt, userId, branchId, lastSeenAt: new Date() })
    .onConflictDoUpdate({
      target: schema.sessions.sid,
      set: { data, expiresAt, userId, branchId, lastSeenAt: new Date() },
    });
}

export async function deleteSession(sid: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.sid, sid));
}

export async function deleteExpiredSessions(): Promise<void> {
  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
}
