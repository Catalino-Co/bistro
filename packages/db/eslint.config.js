import { baseConfig } from '@bistro/config/eslint-base';

export default [
  ...baseConfig,
  {
    ignores: ['dist/**', 'migrations/**'],
  },
  {
    // packages/db IS the DB layer -- it's the one place allowed to import
    // pg/drizzle directly, so the import-boundary rule doesn't apply here.
    files: ['**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
];
