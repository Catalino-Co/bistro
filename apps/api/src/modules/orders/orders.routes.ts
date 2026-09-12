import type { FastifyInstance } from 'fastify';
import {
  addOrderLine,
  closeOrder,
  findOpenOrderForTable,
  getOrderTotals,
  listOrderLines,
  openOrder,
  updateOrderLine,
  voidOrderLine,
} from './orders.repo.js';
import {
  addOrderLineBodySchema,
  openOrderBodySchema,
  updateOrderLineBodySchema,
  voidOrderLineBodySchema,
} from './orders.schema.js';

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

  app.get(
    '/orders/:id/totals',
    { config: { permissions: [...MANAGE_ORDERS] } },
    async (request, reply) => {
      const branchId = request.session.branchId;
      if (typeof branchId !== 'number') {
        reply.code(409);
        return { error: 'no_branch_selected' };
      }
      const orderId = Number((request.params as { id: string }).id);
      const result = await getOrderTotals(branchId, orderId);
      if (result.outcome === 'order_not_found') {
        reply.code(404);
        return { error: 'order_not_found' };
      }
      return result.totals;
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

  app.patch(
    '/orders/:id/lines/:lineId',
    { config: { permissions: [...MANAGE_ORDERS] } },
    async (request, reply) => {
      const branchId = request.session.branchId;
      if (typeof branchId !== 'number') {
        reply.code(409);
        return { error: 'no_branch_selected' };
      }
      const parsed = updateOrderLineBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }

      const { id, lineId } = request.params as { id: string; lineId: string };
      const result = await updateOrderLine(
        branchId,
        Number(id),
        Number(lineId),
        parsed.data.quantity,
        parsed.data.note,
        parsed.data.modifierIds,
        request.session.userId,
      );
      switch (result.outcome) {
        case 'order_not_found':
          reply.code(404);
          return { error: 'order_not_found' };
        case 'order_closed':
          reply.code(409);
          return { error: 'order_closed' };
        case 'line_not_found':
          reply.code(404);
          return { error: 'line_not_found' };
        case 'line_voided':
          reply.code(409);
          return { error: 'line_voided' };
        case 'modifier_not_allowed':
          reply.code(400);
          return { error: 'modifier_not_allowed' };
        case 'updated':
          reply.code(200);
          return { line: result.line };
      }
    },
  );

  app.post(
    '/orders/:id/lines/:lineId/void',
    { config: { permissions: [...MANAGE_ORDERS] } },
    async (request, reply) => {
      const branchId = request.session.branchId;
      if (typeof branchId !== 'number') {
        reply.code(409);
        return { error: 'no_branch_selected' };
      }
      const parsed = voidOrderLineBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }

      const { id, lineId } = request.params as { id: string; lineId: string };
      const result = await voidOrderLine(
        branchId,
        Number(id),
        Number(lineId),
        parsed.data.reason,
        request.session.userId,
      );
      switch (result.outcome) {
        case 'order_not_found':
          reply.code(404);
          return { error: 'order_not_found' };
        case 'order_closed':
          reply.code(409);
          return { error: 'order_closed' };
        case 'line_not_found':
          reply.code(404);
          return { error: 'line_not_found' };
        case 'already_voided':
          reply.code(409);
          return { error: 'already_voided' };
        case 'voided':
          reply.code(204);
          return null;
      }
    },
  );
}
