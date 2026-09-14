import { eq } from 'drizzle-orm';
import { db } from '../client.js';
import { customers, customerTypes } from '../schema/index.js';

// Clientes demo, no los de nadie real -- igual que `demo-branches`, para
// que una instalación nueva pueda abrir la pantalla de Clientes y el
// selector del POS con algo dentro en vez de dos estados vacíos.
//
// Uno de cada caso que la pantalla distingue: una cuenta corporativa, que
// es la que lleva RNC en su factura, y un huésped, que es el único tipo
// que habilita el despacho a habitación.
const DEMO_CUSTOMERS = [
  {
    typeName: 'Corporativo',
    name: 'Hotel Caribe SRL',
    phone: '809-555-7788',
    taxId: '131-55555-5',
  },
  {
    typeName: 'Huésped',
    name: 'María Pérez',
    phone: '809-555-0101',
    taxId: null,
  },
];

// `customers.name` no es único -- dos huéspedes pueden llamarse igual, y en
// un restaurante de verdad se llaman igual -- así que esto es un
// buscar-o-crear manual, no un `onConflictDoUpdate`. Y solo crea: si
// alguien le corrigió el teléfono a una de estas filas, volver a correr el
// seed no se lo pisa.
export async function seedDemoCustomers() {
  const seeded = [];
  for (const demo of DEMO_CUSTOMERS) {
    const [type] = await db
      .select({ id: customerTypes.id })
      .from(customerTypes)
      .where(eq(customerTypes.name, demo.typeName));
    if (!type) {
      throw new Error(`Customer type not found: ${demo.typeName} -- seed customer types first`);
    }

    let [customer] = await db.select().from(customers).where(eq(customers.name, demo.name));
    if (!customer) {
      [customer] = await db
        .insert(customers)
        .values({
          customerTypeId: type.id,
          name: demo.name,
          phone: demo.phone,
          taxId: demo.taxId,
        })
        .returning();
    }
    if (customer) seeded.push(customer);
  }
  return seeded;
}
