import type { FastifyInstance } from 'fastify';
import {
  addOrderLine,
  closeOrder,
  findOpenOrderForTable,
  getOrderDetail,
  getOrderTotals,
  listOrderLines,
  openOrder,
  sendToKitchen,
  updateOrderLine,
  voidOrderLine,
} from './orders.repo.js';
import {
  addOrderLineBodySchema,
  openOrderBodySchema,
  updateOrderLineBodySchema,
  listOrdersQuerySchema,
  voidOrderLineBodySchema,
} from './orders.schema.js';
import { printOrderBill } from './bill.repo.js';
import { listOrders } from './orders.history.repo.js';
import { getTableMap } from './table-map.repo.js';

const MANAGE_ORDERS = ['orders.manage'] as const;

// Open/close lifecycle (B1-6) plus order-taking (B1-7): lines carry their
// own quantity, note, and modifiers.
export async function ordersRoutes(app: FastifyInstance) {
  // El mapa de mesas del POS: áreas, mesas, y la orden abierta de cada una
  // con su total en vivo. Existe como un endpoint propio porque la
  // alternativa -- listar mesas y luego pedir /orders/for-table/:id por
  // cada una -- son N llamadas para pintar una pantalla que se refresca
  // sola durante el servicio.
  app.get(
    '/orders/table-map',
    { config: { permissions: [...MANAGE_ORDERS] } },
    async (request, reply) => {
      const branchId = request.session.branchId;
      if (typeof branchId !== 'number') {
        reply.code(409);
        return { error: 'no_branch_selected' };
      }
      return { areas: await getTableMap(branchId) };
    },
  );

  // El historial. Antes de esto una orden cerrada desaparecía del alcance
  // de la interfaz: los datos estaban, pero no había ruta que los listara.
  app.get('/orders', { config: { permissions: [...MANAGE_ORDERS] } }, async (request, reply) => {
    const branchId = request.session.branchId;
    if (typeof branchId !== 'number') {
      reply.code(409);
      return { error: 'no_branch_selected' };
    }
    const parsed = listOrdersQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const { status, customerId, from, to, search, limit } = parsed.data;
    return {
      orders: await listOrders(branchId, {
        status,
        customerId,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        search,
        limit,
      }),
    };
  });

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

  app.get(
    '/orders/:id',
    { config: { permissions: [...MANAGE_ORDERS] } },
    async (request, reply) => {
      const branchId = request.session.branchId;
      if (typeof branchId !== 'number') {
        reply.code(409);
        return { error: 'no_branch_selected' };
      }
      const order = await getOrderDetail(branchId, Number((request.params as { id: string }).id));
      if (!order) {
        reply.code(404);
        return { error: 'order_not_found' };
      }
      return { order };
    },
  );

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
        case 'insufficient_payment':
          reply.code(409);
          return { error: 'insufficient_payment', balanceDue: result.balanceDue };
        case 'closed':
          reply.code(204);
          return null;
      }
    },
  );

  app.post(
    '/orders/:id/send-to-kitchen',
    { config: { permissions: [...MANAGE_ORDERS] } },
    async (request, reply) => {
      const branchId = request.session.branchId;
      if (typeof branchId !== 'number') {
        reply.code(409);
        return { error: 'no_branch_selected' };
      }

      const result = await sendToKitchen(branchId, Number((request.params as { id: string }).id));
      switch (result.outcome) {
        case 'order_not_found':
          reply.code(404);
          return { error: 'order_not_found' };
        case 'order_closed':
          reply.code(409);
          return { error: 'order_closed' };
        case 'sent':
          reply.code(200);
          return { lines: result.lines, printResults: result.printResults };
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

  // La cuenta del cliente. Sirve igual para la pre-cuenta que se lleva a la
  // mesa antes de cobrar y para la reimpresión de una orden ya cerrada; el
  // papel dice cuántas reimpresiones van y cada intento queda en la
  // bitácora, que es el control que de verdad importa aquí.
  app.post(
    '/orders/:id/print-bill',
    { config: { permissions: [...MANAGE_ORDERS] } },
    async (request, reply) => {
      const branchId = request.session.branchId;
      if (typeof branchId !== 'number') {
        reply.code(409);
        return { error: 'no_branch_selected' };
      }

      const result = await printOrderBill(
        branchId,
        Number((request.params as { id: string }).id),
        request.session.userId!,
      );

      switch (result.outcome) {
        case 'order_not_found':
          reply.code(404);
          return { error: 'order_not_found' };
        case 'no_printer':
          reply.code(409);
          return { error: 'no_receipt_printer' };
        case 'print_failed':
          // 502: la orden y la cuenta están bien; quien falló fue la
          // impresora, y la pantalla tiene que poder decirlo así.
          reply.code(502);
          return { error: 'print_failed', detail: result.error };
        case 'printed':
          return { reprintNumber: result.reprintNumber };
      }
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
        case 'item_not_available':
          reply.code(409);
          return { error: 'item_not_available' };
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
