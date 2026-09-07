import { PERMISSIONS } from '@bistro/permissions';
import { sql } from 'drizzle-orm';
import { db } from '../client.js';
import { permissions } from '../schema/index.js';

// Upserts the permission catalog by key so re-running the seed after adding
// a new permission (or editing a description) is safe and idempotent.
export async function seedPermissions() {
  return db
    .insert(permissions)
    .values(PERMISSIONS.map((p) => ({ key: p.key, description: p.description })))
    .onConflictDoUpdate({
      target: permissions.key,
      set: { description: sql`excluded.description` },
    })
    .returning();
}
