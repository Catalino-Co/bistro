import { baseConfig } from '@bistro/config/eslint-base';

export default [
  ...baseConfig,
  {
    ignores: ['.svelte-kit/**', 'build/**'],
  },
];
