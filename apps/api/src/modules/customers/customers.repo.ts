import { db, schema } from '@bistro/db';
import { and, count, eq, ilike, isNotNull, isNull, max, sum } from 'drizzle-orm';
import { recordAuditEvent } from '../audit/audit.repo.js';

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
  phone: string | null;
  taxId: string | null;
  allowsRoomService: boolean;
  archivedAt: Date | null;
}

const CUSTOMER_COLUMNS = {
  id: schema.customers.id,
  customerTypeId: schema.customers.customerTypeId,
  customerTypeName: schema.customerTypes.name,
  name: schema.customers.name,
  phone: schema.customers.phone,
  taxId: schema.customers.taxId,
  allowsRoomService: schema.customerTypes.allowsRoomService,
  archivedAt: schema.customers.archivedAt,
};

/**
 * Los clientes no son de una sucursal (un huésped o una cuenta corporativa
 * pide desde cualquiera). `search` es la búsqueda del alta rápida del POS
 * -- "¿este cliente ya existe?" -- para que un mesero no acabe creando al
 * mismo huésped en cada visita.
 *
 * El nombre se pinta como texto plano en el front (Svelte lo escapa), que
 * es lo que de verdad hace seguro mostrarlo: aquí no hay nada que
 * sanear.
 */
export async function listCustomers(
  search?: string,
  includeArchived = false,
): Promise<CustomerRow[]> {
  const conditions = [];
  if (!includeArchived) {
    // El POS no debe poder elegir a alguien archivado.
    conditions.push(isNull(schema.customers.archivedAt));
  }
  if (search) {
    conditions.push(ilike(schema.customers.name, `%${search}%`));
  }

  const query = db
    .select(CUSTOMER_COLUMNS)
    .from(schema.customers)
    .innerJoin(schema.customerTypes, eq(schema.customerTypes.id, schema.customers.customerTypeId));
  return conditions.length > 0 ? query.where(and(...conditions)) : query;
}

/** Solo los archivados, para el filtro de la pantalla de clientes. */
export async function listArchivedCustomers(search?: string): Promise<CustomerRow[]> {
  const conditions = [isNotNull(schema.customers.archivedAt)];
  if (search) {
    conditions.push(ilike(schema.customers.name, `%${search}%`));
  }
  return db
    .select(CUSTOMER_COLUMNS)
    .from(schema.customers)
    .innerJoin(schema.customerTypes, eq(schema.customerTypes.id, schema.customers.customerTypeId))
    .where(and(...conditions));
}

export async function findCustomer(id: number): Promise<CustomerRow | null> {
  const [row] = await db
    .select(CUSTOMER_COLUMNS)
    .from(schema.customers)
    .innerJoin(schema.customerTypes, eq(schema.customerTypes.id, schema.customers.customerTypeId))
    .where(eq(schema.customers.id, id));
  return row ?? null;
}

export interface CustomerSummary {
  orderCount: number;
  totalSpent: string;
  lastOrderAt: string | null;
}

/**
 * Lo que ha consumido un cliente, agregado en la base y no sumando la
 * página que el front tuviera cargada: un total que solo cuenta las
 * primeras cincuenta órdenes es un total equivocado.
 *
 * Solo cuenta órdenes cerradas, y con su total congelado: es lo que de
 * verdad se cobró.
 */
export async function getCustomerSummary(customerId: number): Promise<CustomerSummary> {
  const [row] = await db
    .select({
      orderCount: count(schema.orders.id),
      totalSpent: sum(schema.orders.total),
      lastOrderAt: max(schema.orders.closedAt),
    })
    .from(schema.orders)
    .where(and(eq(schema.orders.customerId, customerId), eq(schema.orders.status, 'closed')));

  return {
    orderCount: Number(row?.orderCount ?? 0),
    totalSpent: Number(row?.totalSpent ?? 0).toFixed(4),
    lastOrderAt: row?.lastOrderAt ? new Date(row.lastOrderAt).toISOString() : null,
  };
}

export type CreateCustomerResult =
  { outcome: 'created'; customer: CustomerRow } | { outcome: 'customer_type_not_found' };

export async function createCustomer(
  customerTypeId: number,
  name: string,
  phone: string | null,
  taxId: string | null,
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

  const [row] = await db
    .insert(schema.customers)
    .values({ customerTypeId, name, phone, taxId })
    .returning();
  if (!row) throw new Error('Failed to create customer');

  return {
    outcome: 'created',
    customer: {
      id: row.id,
      customerTypeId,
      customerTypeName: type.name,
      name: row.name,
      phone: row.phone,
      taxId: row.taxId,
      allowsRoomService: type.allowsRoomService,
      archivedAt: null,
    },
  };
}

export interface CustomerPatch {
  name?: string | undefined;
  customerTypeId?: number | undefined;
  phone?: string | null | undefined;
  taxId?: string | null | undefined;
}

export type UpdateCustomerResult =
  | { outcome: 'updated'; customer: CustomerRow }
  | { outcome: 'customer_not_found' }
  | { outcome: 'customer_archived' }
  | { outcome: 'customer_type_not_found' };

export async function updateCustomer(
  customerId: number,
  patch: CustomerPatch,
  actorUserId: number,
  branchId?: number,
): Promise<UpdateCustomerResult> {
  const before = await findCustomer(customerId);
  if (!before) return { outcome: 'customer_not_found' };
  if (before.archivedAt !== null) return { outcome: 'customer_archived' };

  if (patch.customerTypeId !== undefined) {
    const [type] = await db
      .select({ id: schema.customerTypes.id })
      .from(schema.customerTypes)
      .where(eq(schema.customerTypes.id, patch.customerTypeId));
    if (!type) return { outcome: 'customer_type_not_found' };
  }

  // Solo las claves definidas. `null` sí es un valor: así se borra un
  // teléfono o un RNC que se cargó por error.
  const values: Partial<typeof schema.customers.$inferInsert> = {};
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.customerTypeId !== undefined) values.customerTypeId = patch.customerTypeId;
  if (patch.phone !== undefined) values.phone = patch.phone;
  if (patch.taxId !== undefined) values.taxId = patch.taxId;

  if (Object.keys(values).length > 0) {
    await db.update(schema.customers).set(values).where(eq(schema.customers.id, customerId));

    const previous: Record<string, unknown> = {};
    for (const key of Object.keys(values)) {
      previous[key] = before[key as keyof CustomerRow];
    }
    await recordAuditEvent({
      actionKey: 'customers.updated',
      entityType: 'customer',
      entityId: String(customerId),
      beforeData: previous,
      afterData: values as Record<string, unknown>,
      userId: actorUserId,
      branchId,
    });
  }

  const after = await findCustomer(customerId);
  if (!after) throw new Error('Failed to reload customer');
  return { outcome: 'updated', customer: after };
}

export type ArchiveCustomerResult =
  | { outcome: 'archived'; customer: CustomerRow }
  | { outcome: 'customer_not_found' }
  | { outcome: 'already_archived' };

/**
 * Archivar: el cliente sale del buscador del POS pero sus órdenes siguen
 * apuntando a él, así que el historial y los reportes no se mueven.
 */
export async function archiveCustomer(
  customerId: number,
  actorUserId: number,
  branchId?: number,
): Promise<ArchiveCustomerResult> {
  const before = await findCustomer(customerId);
  if (!before) return { outcome: 'customer_not_found' };
  if (before.archivedAt !== null) return { outcome: 'already_archived' };

  await db
    .update(schema.customers)
    .set({ archivedAt: new Date() })
    .where(eq(schema.customers.id, customerId));

  const after = await findCustomer(customerId);
  if (!after) throw new Error('Failed to reload customer');

  await recordAuditEvent({
    actionKey: 'customers.archived',
    entityType: 'customer',
    entityId: String(customerId),
    beforeData: { archivedAt: null },
    afterData: { archivedAt: after.archivedAt?.toISOString() },
    userId: actorUserId,
    branchId,
  });
  return { outcome: 'archived', customer: after };
}

export type RestoreCustomerResult =
  | { outcome: 'restored'; customer: CustomerRow }
  | { outcome: 'customer_not_found' }
  | { outcome: 'not_archived' };

export async function restoreCustomer(
  customerId: number,
  actorUserId: number,
  branchId?: number,
): Promise<RestoreCustomerResult> {
  const before = await findCustomer(customerId);
  if (!before) return { outcome: 'customer_not_found' };
  if (before.archivedAt === null) return { outcome: 'not_archived' };

  await db
    .update(schema.customers)
    .set({ archivedAt: null })
    .where(eq(schema.customers.id, customerId));

  const after = await findCustomer(customerId);
  if (!after) throw new Error('Failed to reload customer');

  await recordAuditEvent({
    actionKey: 'customers.restored',
    entityType: 'customer',
    entityId: String(customerId),
    beforeData: { archivedAt: before.archivedAt.toISOString() },
    afterData: { archivedAt: null },
    userId: actorUserId,
    branchId,
  });
  return { outcome: 'restored', customer: after };
}
