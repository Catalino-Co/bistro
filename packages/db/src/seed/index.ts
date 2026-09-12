import { pool } from '../client.js';
import { seedCustomerTypes } from './customer-types.js';
import { seedDemoBranches } from './demo-branches.js';
import { seedPaymentMethods } from './payment-methods.js';
import { seedPermissions } from './permissions.js';
import { seedAdminRole } from './roles.js';
import { seedTaxRates } from './tax-rates.js';

async function main() {
  await seedPermissions();
  await seedAdminRole();
  await seedTaxRates();
  await seedCustomerTypes();
  await seedPaymentMethods();
  await seedDemoBranches();
  await pool.end();
  console.log('Seed complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
