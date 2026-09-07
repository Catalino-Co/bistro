import { pool } from '../client';
import { seedCustomerTypes } from './customer-types';
import { seedPermissions } from './permissions';
import { seedAdminRole } from './roles';
import { seedTaxRates } from './tax-rates';

async function main() {
  await seedPermissions();
  await seedAdminRole();
  await seedTaxRates();
  await seedCustomerTypes();
  await pool.end();
  console.log('Seed complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
