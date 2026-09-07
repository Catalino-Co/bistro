import { pgSchema } from 'drizzle-orm/pg-core';

// Every Bistro table lives in its own Postgres schema (not `public`) so it
// can coexist cleanly with other schemas/roles on a shared cluster.
export const bistro = pgSchema('bistro');

export const statusEnum = bistro.enum('status', ['active', 'inactive']);
