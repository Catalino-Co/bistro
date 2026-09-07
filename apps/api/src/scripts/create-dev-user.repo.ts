/**
 * Dev-only bootstrap: creates (or updates the password of) a local login
 * so B0-6/B0-7 can be exercised end-to-end before any onboarding UI exists.
 * Not part of the seed pipeline in packages/db -- that seeds reference
 * data, not credentialed accounts.
 *
 * Usage: pnpm --filter @bistro/api run dev:create-user
 * Env overrides: DEV_USER_USERNAME, DEV_USER_PASSWORD
 */
import { db, pool, schema } from '@bistro/db';
import argon2 from 'argon2';
import { sql } from 'drizzle-orm';

async function main() {
  const username = process.env.DEV_USER_USERNAME ?? 'admin';
  const password = process.env.DEV_USER_PASSWORD ?? 'ChangeMe123!';

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  await db
    .insert(schema.users)
    .values({ username, fullName: 'Dev Admin', passwordHash })
    .onConflictDoUpdate({
      target: schema.users.username,
      set: { passwordHash: sql`excluded.password_hash` },
    });

  await pool.end();
  console.log(`Dev user ready: username=${username}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
