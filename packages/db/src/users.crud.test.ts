import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { db, pool } from './client.js';
import { users } from './schema/users.js';

// The example integration test B0-13 calls for. Originally scoped to run
// against a Testcontainers-provisioned ephemeral Postgres; that's deferred
// (see the plan) since the user asked not to introduce Docker for now, so
// this runs against the shared bistro_dev dev database instead, cleaning
// up its own row by id afterward.
describe('users CRUD', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('creates, reads, updates, and deletes a user', async () => {
    const [created] = await db
      .insert(users)
      .values({
        username: '__users_crud_test__',
        fullName: 'CRUD Test User',
        passwordHash: 'not-a-real-hash',
      })
      .returning();
    expect(created?.status).toBe('active');
    const id = created!.id;

    const [found] = await db.select().from(users).where(eq(users.id, id));
    expect(found?.username).toBe('__users_crud_test__');

    await db.update(users).set({ fullName: 'Updated Name' }).where(eq(users.id, id));
    const [updated] = await db.select().from(users).where(eq(users.id, id));
    expect(updated?.fullName).toBe('Updated Name');

    await db.delete(users).where(eq(users.id, id));
    const remaining = await db.select().from(users).where(eq(users.id, id));
    expect(remaining).toHaveLength(0);
  });
});
