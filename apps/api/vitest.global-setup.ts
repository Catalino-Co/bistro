import { sweepTestData } from './src/test-support/cleanup.repo.js';

// Runs exactly once before the whole test run starts (not per file), so
// the broad "__%" wildcard sweep here is safe -- nothing else is running
// concurrently yet. Cleans up any debris a previous run left behind (e.g.
// a crashed process that never reached its own afterAll) so the suite
// starts from a known state. Individual test files still do their own
// narrow, id-scoped cleanup in afterAll since they run concurrently with
// each other.
export default async function setup() {
  await sweepTestData();
}
