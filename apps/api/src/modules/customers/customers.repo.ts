import { db, schema } from '@bistro/db';
import { eq, ilike } from 'drizzle-orm';

export interface CustomerTypeRow {
  id: number;
  name: string;
  allowsRoomService: boolean;
}

export async function listCustomerTypes(): Promise<CustomerTypeRow[]> {
  return db
    .select({
      id: schema.customerTypes.id,
      name: schema.customerTypes.name,
      allowsRoomService: schema.customerTypes.allowsRoomService,
    })
    .from(schema.customerTypes);
}

export interface CustomerRow {
  id: number;
  customerTypeId: number;
  customerTypeName: string;
  name: string;
  allowsRoomService: boolean;
}

// Customers aren't branch-scoped (a hotel guest or corporate account can
// order from any branch) -- `search` is the quick-add flow's "does this
// customer already exist" lookup, so a waiter isn't stuck re-creating the
// same guest on every visit. Display is plain text interpolation on the
// frontend (Svelte auto-escapes it), which is what actually makes a
// customer's name safe to show -- there is nothing to sanitize here.
export async function listCustomers(search?: string): Promise<CustomerRow[]> {
  const query = db
    .select({
      id: schema.customers.id,
      customerTypeId: schema.customers.customerTypeId,
      customerTypeName: schema.customerTypes.name,
      name: schema.customers.name,
      allowsRoomService: schema.customerTypes.allowsRoomService,
    })
    .from(schema.customers)
    .innerJoin(schema.customerTypes, eq(schema.customerTypes.id, schema.customers.customerTypeId));
  return search ? query.where(ilike(schema.customers.name, `%${search}%`)) : query;
}

export type CreateCustomerResult =
  | { outcome: 'created'; customer: CustomerRow }
  | { outcome: 'customer_type_not_found' };

export async function createCustomer(
  customerTypeId: number,
  name: string,
): Promise<CreateCustomerResult> {
  const [type] = await db
    .select({
      id: schema.customerTypes.id,
      name: schema.customerTypes.name,
      allowsRoomService: schema.customerTypes.allowsRoomService,
    })
    .from(schema.customerTypes)
    .where(eq(schema.customerTypes.id, customerTypeId));
  if (!type) {
    return { outcome: 'customer_type_not_found' };
  }

  const [row] = await db.insert(schema.customers).values({ customerTypeId, name }).returning();
  if (!row) throw new Error('Failed to create customer');

  return {
    outcome: 'created',
    customer: {
      id: row.id,
      customerTypeId,
      customerTypeName: type.name,
      name: row.name,
      allowsRoomService: type.allowsRoomService,
    },
  };
}
