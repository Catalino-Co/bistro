import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client';

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

async function main() {
  // bistro_app only has CREATE granted on the "bistro" schema, not on the
  // database itself, so the migration-tracking table has to live there too
  // instead of drizzle's default "drizzle" schema (which it can't create).
  await migrate(db, { migrationsFolder, migrationsSchema: 'bistro' });
  await pool.end();
  console.log('Migrations applied.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
