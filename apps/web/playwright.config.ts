import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const apiDir = fileURLToPath(new URL('../api', import.meta.url));
const webDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  webServer: [
    {
      command: 'pnpm run dev',
      cwd: apiDir,
      url: 'http://localhost:3001/health',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm run dev',
      cwd: webDir,
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
  ],
  use: {
    baseURL: 'http://localhost:5173',
  },
});
