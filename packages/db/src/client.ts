import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const pool = new Pool({
  connectionString: requireEnv('DATABASE_URL'),
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;
