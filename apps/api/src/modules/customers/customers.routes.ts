import type { FastifyInstance } from 'fastify';
import {
  archiveCustomer,
  createCustomer,
  findCustomer,
  getCustomerSummary,
  listArchivedCustomers,
  listCustomers,
  listCustomerTypes,
  restoreCustomer,
  updateCustomer,
} from './customers.repo.js';
import {
  createCustomerBodySchema,
  listCustomersQuerySchema,
  updateCustomerBodySchema,
} from './customers.schema.js';

// Same actor/permission as opening an order (a waiter picking or quick-
// adding a customer is part of that same flow, most importantly for
// room_service dispatch) -- no separate permission for this yet. Editing
// and archiving ride along on it: in a restaurant the person taking the
// order is usually the one who knows the guest, and every change is
// audited with who made it.
const MANAGE_ORDERS = ['orders.manage'] as const;

export async function customersRoutes(app: FastifyInstance) {
  app.get('/customer-types', { config: { permissions: [...MANAGE_ORDERS] } }, async () => ({
    customerTypes: await listCustomerTypes(),
  }));

  app.get('/customers', { config: { permissions: [...MANAGE_ORDERS] } }, async (request, reply) => {
    const parsed = listCustomersQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const { search, status } = parsed.data;
    return {
      customers:
        status === 'archived' ? await listArchivedCustomers(search) : await listCustomers(search),
    };
  });

  // La ficha: el cliente más lo que ha consumido. El resumen se agrega en la
  // base y no sumando la página que el front tuviera cargada.
  app.get(
    '/customers/:id',
    { config: { permissions: [...MANAGE_ORDERS] } },
    async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      const customer = await findCustomer(id);
      if (!customer) {
        reply.code(404);
        return { error: 'customer_not_found' };
      }
      return { customer, summary: await getCustomerSummary(id) };
    },
  );

  app.post(
    '/customers',
    { config: { permissions: [...MANAGE_ORDERS] } },
    async (request, reply) => {
      const parsed = createCustomerBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }

      const result = await createCustomer(
        parsed.data.customerTypeId,
        parsed.data.name,
        parsed.data.phone ?? null,
        parsed.data.taxId ?? null,
      );
      if (result.outcome === 'customer_type_not_found') {
        reply.code(404);
        return { error: 'customer_type_not_found' };
      }
      reply.code(201);
      return { customer: result.customer };
    },
  );

  app.patch(
    '/customers/:id',
    { config: { permissions: [...MANAGE_ORDERS] } },
    async (request, reply) => {
      const parsed = updateCustomerBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }

      const result = await updateCustomer(
        Number((request.params as { id: string }).id),
        parsed.data,
        request.session.userId!,
        request.session.branchId,
      );

      switch (result.outcome) {
        case 'customer_not_found':
          reply.code(404);
          return { error: 'customer_not_found' };
        case 'customer_type_not_found':
          reply.code(400);
          return { error: 'customer_type_not_found' };
        case 'customer_archived':
          reply.code(409);
          return { error: 'customer_archived' };
        case 'updated':
          return { customer: result.customer };
      }
    },
  );

  // Archivar, no borrar: sus órdenes lo referencian, así que borrarlo sería
  // borrar historial de ventas.
  app.post(
    '/customers/:id/archive',
    { config: { permissions: [...MANAGE_ORDERS] } },
    async (request, reply) => {
      const result = await archiveCustomer(
        Number((request.params as { id: string }).id),
        request.session.userId!,
        request.session.branchId,
      );
      switch (result.outcome) {
        case 'customer_not_found':
          reply.code(404);
          return { error: 'customer_not_found' };
        case 'already_archived':
          reply.code(409);
          return { error: 'already_archived' };
        case 'archived':
          return { customer: result.customer };
      }
    },
  );

  app.post(
    '/customers/:id/restore',
    { config: { permissions: [...MANAGE_ORDERS] } },
    async (request, reply) => {
      const result = await restoreCustomer(
        Number((request.params as { id: string }).id),
        request.session.userId!,
        request.session.branchId,
      );
      switch (result.outcome) {
        case 'customer_not_found':
          reply.code(404);
          return { error: 'customer_not_found' };
        case 'not_archived':
          reply.code(409);
          return { error: 'not_archived' };
        case 'restored':
          return { customer: result.customer };
      }
    },
  );
}
