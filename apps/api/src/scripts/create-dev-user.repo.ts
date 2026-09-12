/**
 * Dev-only bootstrap: creates (or updates the password of) a local login
 * so B0-6/B0-7 can be exercised end-to-end before any onboarding UI exists.
 * Not part of the seed pipeline in packages/db -- that seeds reference
 * data, not credentialed accounts.
 *
 * Also grants this user the "admin" role in packages/db's demo branches
 * (Sucursal Centro/Norte), if they've been seeded -- otherwise the demo
 * branches exist in the DB but this login couldn't see or switch between
 * them (GET /branches/mine reads user_roles, not the branches table
 * directly).
 *
 * Usage: pnpm --filter @bistro/api run dev:create-user
 * Env overrides: DEV_USER_USERNAME, DEV_USER_PASSWORD
 */
import { db, pool, schema } from '@bistro/db';
import argon2 from 'argon2';
import { eq, inArray, sql } from 'drizzle-orm';

async function main() {
  const username = process.env.DEV_USER_USERNAME ?? 'admin';
  const password = process.env.DEV_USER_PASSWORD ?? 'ChangeMe123!';

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const [user] = await db
    .insert(schema.users)
    .values({ username, fullName: 'Dev Admin', passwordHash })
    .onConflictDoUpdate({
      target: schema.users.username,
      set: { passwordHash: sql`excluded.password_hash` },
    })
    .returning();
  if (!user) throw new Error('Failed to create/update dev user');

  const [adminRole] = await db.select().from(schema.roles).where(eq(schema.roles.name, 'admin'));
  const demoBranches = await db
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(inArray(schema.branches.name, ['Sucursal Centro', 'Sucursal Norte']));

  if (adminRole && demoBranches.length > 0) {
    await db
      .insert(schema.userRoles)
      .values(demoBranches.map((b) => ({ userId: user.id, roleId: adminRole.id, branchId: b.id })))
      .onConflictDoNothing();
  }

  await pool.end();
  console.log(`Dev user ready: username=${username}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
