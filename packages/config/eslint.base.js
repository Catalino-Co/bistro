import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

// The legacy system built SQL by string concatenation everywhere despite
// using a DB library. This rule makes that structurally hard to repeat:
// only a <module>.repo.ts file (or packages/db itself) may import the DB
// client or a raw driver, so every other layer is forced through the
// query builder's parameterized API.
const dbBoundaryRule = [
  'error',
  {
    paths: [
      {
        name: '@bistro/db',
        message:
          'Only *.repo.ts files may import @bistro/db directly. Put data access behind a <module>.repo.ts file.',
      },
    ],
    patterns: [
      {
        group: [
          'pg',
          'pg/*',
          'postgres',
          'drizzle-orm/node-postgres',
          'drizzle-orm/node-postgres/*',
        ],
        message: 'Raw DB client/driver imports are only allowed inside packages/db.',
      },
    ],
  },
];

export const baseConfig = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['**/*.repo.ts'],
    rules: {
      'no-restricted-imports': dbBoundaryRule,
    },
  },
  prettier,
];
