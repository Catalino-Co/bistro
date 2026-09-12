import type { FastifyInstance } from 'fastify';
import { createCustomer, listCustomers, listCustomerTypes } from './customers.repo.js';
import { createCustomerBodySchema } from './customers.schema.js';

// Same actor/permission as opening an order (a waiter picking or quick-
// adding a customer is part of that same flow, most importantly for
// room_service dispatch) -- no separate permission for this yet.
const MANAGE_ORDERS = ['orders.manage'] as const;

export async function customersRoutes(app: FastifyInstance) {
  app.get(
    '/customer-types',
    { config: { permissions: [...MANAGE_ORDERS] } },
    async () => ({ customerTypes: await listCustomerTypes() }),
  );

  app.get('/customers', { config: { permissions: [...MANAGE_ORDERS] } }, async (request) => {
    const { search } = request.query as { search?: string };
    return { customers: await listCustomers(search) };
  });

  app.post(
    '/customers',
    { config: { permissions: [...MANAGE_ORDERS] } },
    async (request, reply) => {
      const parsed = createCustomerBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }

      const result = await createCustomer(parsed.data.customerTypeId, parsed.data.name);
      if (result.outcome === 'customer_type_not_found') {
        reply.code(404);
        return { error: 'customer_type_not_found' };
      }
      reply.code(201);
      return { customer: result.customer };
    },
  );
}
