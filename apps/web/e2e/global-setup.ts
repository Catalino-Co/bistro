import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const apiDir = fileURLToPath(new URL('../../api', import.meta.url));

const E2E_USERNAME = '__e2e_smoke_user__';
const E2E_PASSWORD = 'CorrectHorseBatteryStaple1!';

// Reuses apps/api's existing dev-user bootstrap script (upserts by
// username) instead of importing @bistro/db into the web app just for
// e2e fixture setup -- the e2e suite treats both servers as black boxes.
export default function globalSetup() {
  execSync('pnpm run dev:create-user', {
    cwd: apiDir,
    env: {
      ...process.env,
      DEV_USER_USERNAME: E2E_USERNAME,
      DEV_USER_PASSWORD: E2E_PASSWORD,
    },
    stdio: 'inherit',
  });
}

export { E2E_PASSWORD, E2E_USERNAME };
