import type { FastifyInstance } from 'fastify';
import { addPayment, listPaymentMethods, listPayments } from './payments.repo.js';
import { addPaymentBodySchema } from './payments.schema.js';

const MANAGE_ORDERS = ['orders.manage'] as const;

export async function paymentsRoutes(app: FastifyInstance) {
  app.get(
    '/payment-methods',
    { config: { permissions: [...MANAGE_ORDERS] } },
    async () => ({ paymentMethods: await listPaymentMethods() }),
  );

  app.get(
    '/orders/:id/payments',
    { config: { permissions: [...MANAGE_ORDERS] } },
    async (request, reply) => {
      const branchId = request.session.branchId;
      if (typeof branchId !== 'number') {
        reply.code(409);
        return { error: 'no_branch_selected' };
      }
      const orderId = Number((request.params as { id: string }).id);
      return { payments: await listPayments(branchId, orderId) };
    },
  );

  app.post(
    '/orders/:id/payments',
    { config: { permissions: [...MANAGE_ORDERS] } },
    async (request, reply) => {
      const branchId = request.session.branchId;
      if (typeof branchId !== 'number') {
        reply.code(409);
        return { error: 'no_branch_selected' };
      }
      const parsed = addPaymentBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }

      const orderId = Number((request.params as { id: string }).id);
      const result = await addPayment(
        branchId,
        orderId,
        parsed.data.paymentMethodId,
        parsed.data.amount,
        parsed.data.tipAmount,
        parsed.data.tenderedAmount,
      );
      switch (result.outcome) {
        case 'order_not_found':
          reply.code(404);
          return { error: 'order_not_found' };
        case 'order_closed':
          reply.code(409);
          return { error: 'order_closed' };
        case 'payment_method_not_found':
          reply.code(404);
          return { error: 'payment_method_not_found' };
        case 'tendered_amount_too_low':
          reply.code(400);
          return { error: 'tendered_amount_too_low' };
        case 'amount_exceeds_balance':
          reply.code(409);
          return { error: 'amount_exceeds_balance', balanceDue: result.balanceDue };
        case 'added':
          reply.code(201);
          return { payment: result.payment };
      }
    },
  );
}
