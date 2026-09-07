import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { db, pool } from './client.js';
import { companies } from './schema/org.js';

describe('db client', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('round-trips a row through the bistro schema', async () => {
    const [inserted] = await db
      .insert(companies)
      .values({ name: '__client_test_co__' })
      .returning();

    expect(inserted?.status).toBe('active');

    const [found] = await db.select().from(companies).where(eq(companies.id, inserted!.id));

    expect(found?.name).toBe('__client_test_co__');

    await db.delete(companies).where(eq(companies.id, inserted!.id));
  });
});
