import { sql } from 'drizzle-orm';
import { db } from '../client';
import { taxRates } from '../schema';

// The legacy system hardcoded 18% ITBIS in ~4 different files. Seeding the
// real Dominican rates here means the POS reads tax_rates instead.
const TAX_RATES = [
  { name: 'ITBIS 18%', rate: '0.1800' },
  { name: 'Exento 0%', rate: '0.0000' },
];

export async function seedTaxRates() {
  return db
    .insert(taxRates)
    .values(TAX_RATES)
    .onConflictDoUpdate({
      target: taxRates.name,
      set: { rate: sql`excluded.rate` },
    })
    .returning();
}
