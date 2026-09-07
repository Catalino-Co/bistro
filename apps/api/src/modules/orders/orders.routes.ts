import type { FastifyInstance } from 'fastify';
import {
  addOrderLine,
  closeOrder,
  findOpenOrderForTable,
  listOrderLines,
  openOrder,
} from './orders.repo.js';
import { addOrderLineBodySchema, openOrderBodySchema } from './orders.schema.js';

const MANAGE_ORDERS = ['orders.manage'] as const;

// Open/close lifecycle (B1-6) plus order-taking (B1-7): lines carry their
// own quantity, note, and modifiers.
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

    const result = await openOrder(
      branchId,
      parsed.data.dineTableId,
      parsed.data.dispatchMode,
      parsed.data.customerId,
    );
    switch (result.outcome) {
      case 'table_not_found':
        reply.code(404);
        return { error: 'table_not_found' };
      case 'table_occupied':
        reply.code(409);
        return { error: 'table_occupied' };
      case 'room_service_not_allowed':
        reply.code(409);
        return { error: 'room_service_not_allowed' };
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

  app.get(
    '/orders/for-table/:dineTableId',
    { config: { permissions: [...MANAGE_ORDERS] } },
    async (request, reply) => {
      const branchId = request.session.branchId;
      if (typeof branchId !== 'number') {
        reply.code(409);
        return { error: 'no_branch_selected' };
      }
      const dineTableId = Number((request.params as { dineTableId: string }).dineTableId);
      return { order: await findOpenOrderForTable(branchId, dineTableId) };
    },
  );

  app.get(
    '/orders/:id/lines',
    { config: { permissions: [...MANAGE_ORDERS] } },
    async (request, reply) => {
      const branchId = request.session.branchId;
      if (typeof branchId !== 'number') {
        reply.code(409);
        return { error: 'no_branch_selected' };
      }
      const orderId = Number((request.params as { id: string }).id);
      return { lines: await listOrderLines(branchId, orderId) };
    },
  );

  app.post(
    '/orders/:id/lines',
    { config: { permissions: [...MANAGE_ORDERS] } },
    async (request, reply) => {
      const branchId = request.session.branchId;
      if (typeof branchId !== 'number') {
        reply.code(409);
        return { error: 'no_branch_selected' };
      }
      const parsed = addOrderLineBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }

      const orderId = Number((request.params as { id: string }).id);
      const result = await addOrderLine(
        branchId,
        orderId,
        parsed.data.itemId,
        parsed.data.quantity,
        parsed.data.note,
        parsed.data.modifierIds,
      );
      switch (result.outcome) {
        case 'order_not_found':
          reply.code(404);
          return { error: 'order_not_found' };
        case 'order_closed':
          reply.code(409);
          return { error: 'order_closed' };
        case 'item_not_found':
          reply.code(404);
          return { error: 'item_not_found' };
        case 'modifier_not_allowed':
          reply.code(400);
          return { error: 'modifier_not_allowed' };
        case 'added':
          reply.code(201);
          return { line: result.line };
      }
    },
  );
}
