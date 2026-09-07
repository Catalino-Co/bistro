import type { FastifyInstance } from 'fastify';
import { closeOrder, openOrder } from './orders.repo.js';
import { openOrderBodySchema } from './orders.schema.js';

const MANAGE_ORDERS = ['orders.manage'] as const;

// Minimal open/close lifecycle for B1-6: opening an order occupies its
// table, closing (billing) frees it. Order lines/modifiers land in B1-7.
export async function ordersRoutes(app: FastifyInstance) {
  app.post('/orders', { config: { permissions: [...MANAGE_ORDERS] } }, async (request, reply) => {
    const branchId = request.session.branchId;
    if (typeof branchId !== 'number') {
      reply.code(409);
      return { error: 'no_branch_selected' };
    }
    const parsed = openOrderBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }

    const result = await openOrder(branchId, parsed.data.dineTableId);
    switch (result.outcome) {
      case 'table_not_found':
        reply.code(404);
        return { error: 'table_not_found' };
      case 'table_occupied':
        reply.code(409);
        return { error: 'table_occupied' };
      case 'opened':
        reply.code(201);
        return { order: result.order };
    }
  });

  app.post(
    '/orders/:id/close',
    { config: { permissions: [...MANAGE_ORDERS] } },
    async (request, reply) => {
      const branchId = request.session.branchId;
      if (typeof branchId !== 'number') {
        reply.code(409);
        return { error: 'no_branch_selected' };
      }

      const result = await closeOrder(branchId, Number((request.params as { id: string }).id));
      switch (result.outcome) {
        case 'not_found':
          reply.code(404);
          return { error: 'order_not_found' };
        case 'already_closed':
          reply.code(409);
          return { error: 'already_closed' };
        case 'closed':
          reply.code(204);
          return null;
      }
    },
  );
}
