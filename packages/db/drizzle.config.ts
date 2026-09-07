import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  throw new Error('Missing required environment variable: DATABASE_URL');
}

export default defineConfig({
  // Points at the *compiled* schema, not src/, on purpose: drizzle-kit's
  // internal esbuild-based loader does plain CJS require() for a schema
  // module's nested imports and doesn't map NodeNext's explicit ".js"
  // extensions back to their .ts source, so it can't load src/ directly.
  // The dist output already has real, valid extensions (tsc preserves
  // them verbatim under NodeNext), so drizzle-kit just loads plain JS.
  // Run `pnpm run build` (or use `pnpm run db:generate`, which does it
  // for you) before this if the schema changed.
  schema: './dist/schema/index.js',
  out: './migrations',
  dialect: 'postgresql',
  schemaFilter: ['bistro'],
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
