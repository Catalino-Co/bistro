import { baseConfig } from '@bistro/config/eslint-base';

export default [
  ...baseConfig,
  {
    ignores: ['dist/**'],
  },
];
