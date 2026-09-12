import { db, schema } from '@bistro/db';
import { and, eq } from 'drizzle-orm';
import { computeOrderTotals, type Executor } from '../orders/order-totals.repo.js';

export interface PaymentMethodRow {
  id: number;
  name: string;
}

export async function listPaymentMethods(): Promise<PaymentMethodRow[]> {
  return db
    .select({ id: schema.paymentMethods.id, name: schema.paymentMethods.name })
    .from(schema.paymentMethods)
    .where(eq(schema.paymentMethods.status, 'active'));
}

export interface PaymentRow {
  id: number;
  orderId: number;
  paymentMethodId: number;
  paymentMethodName: string;
  amount: string;
  tipAmount: string;
  tenderedAmount: string | null;
  createdAt: Date;
}

export async function listPayments(branchId: number, orderId: number): Promise<PaymentRow[]> {
  const [order] = await db
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.branchId, branchId)));
  if (!order) {
    return [];
  }

  return db
    .select({
      id: schema.payments.id,
      orderId: schema.payments.orderId,
      paymentMethodId: schema.payments.paymentMethodId,
      paymentMethodName: schema.paymentMethods.name,
      amount: schema.payments.amount,
      tipAmount: schema.payments.tipAmount,
      tenderedAmount: schema.payments.tenderedAmount,
      createdAt: schema.payments.createdAt,
    })
    .from(schema.payments)
    .innerJoin(schema.paymentMethods, eq(schema.paymentMethods.id, schema.payments.paymentMethodId))
    .where(eq(schema.payments.orderId, orderId));
}

// Sum of `amount` already applied toward the bill -- excludes tip and cash
// change, neither of which counts against what's owed. Shared with
// orders.repo.ts's closeOrder, which needs the same figure to decide
// whether the order has been paid enough to close.
export async function sumPaymentsAmount(executor: Executor, orderId: number): Promise<number> {
  const rows = await executor
    .select({ amount: schema.payments.amount })
    .from(schema.payments)
    .where(eq(schema.payments.orderId, orderId));
  return rows.reduce((sum, row) => sum + Number(row.amount), 0);
}

// Ten-thousandths, matching the numeric(12,4) columns -- integer math here
// avoids the float-rounding false negatives a plain `>` comparison on the
// raw numbers could produce.
function toCents(amount: number): number {
  return Math.round(amount * 10000);
}

export type AddPaymentResult =
  | { outcome: 'added'; payment: PaymentRow }
  | { outcome: 'order_not_found' }
  | { outcome: 'order_closed' }
  | { outcome: 'payment_method_not_found' }
  | { outcome: 'tendered_amount_too_low' }
  | { outcome: 'amount_exceeds_balance'; balanceDue: string };

// A payment's own `amount` is capped at the remaining balance due (computed
// live, the same way closeOrder will), so split-payment rows can never sum
// to more than the order's total -- closeOrder only has to check the sum,
// never worry about overpayment it would need to refund.
export async function addPayment(
  branchId: number,
  orderId: number,
  paymentMethodId: number,
  amount: string,
  tipAmount: string,
  tenderedAmount: string | undefined,
): Promise<AddPaymentResult> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select({ id: schema.orders.id, status: schema.orders.status })
      .from(schema.orders)
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.branchId, branchId)))
      .for('update');
    if (!order) {
      return { outcome: 'order_not_found' };
    }
    if (order.status === 'closed') {
      return { outcome: 'order_closed' };
    }

    const [method] = await tx
      .select({ id: schema.paymentMethods.id, name: schema.paymentMethods.name })
      .from(schema.paymentMethods)
      .where(eq(schema.paymentMethods.id, paymentMethodId));
    if (!method) {
      return { outcome: 'payment_method_not_found' };
    }

    const amountCents = toCents(Number(amount));
    if (tenderedAmount !== undefined && toCents(Number(tenderedAmount)) < amountCents) {
      return { outcome: 'tendered_amount_too_low' };
    }

    const totals = await computeOrderTotals(tx, orderId);
    const paidSoFarCents = toCents(await sumPaymentsAmount(tx, orderId));
    const balanceDueCents = toCents(totals.total) - paidSoFarCents;
    if (amountCents > balanceDueCents) {
      return {
        outcome: 'amount_exceeds_balance',
        balanceDue: (balanceDueCents / 10000).toFixed(4),
      };
    }

    const [payment] = await tx
      .insert(schema.payments)
      .values({
        orderId,
        paymentMethodId,
        amount,
        tipAmount,
        tenderedAmount: tenderedAmount ?? null,
      })
      .returning();
    if (!payment) throw new Error('Failed to add payment');

    return {
      outcome: 'added',
      payment: {
        id: payment.id,
        orderId: payment.orderId,
        paymentMethodId: payment.paymentMethodId,
        paymentMethodName: method.name,
        amount: payment.amount,
        tipAmount: payment.tipAmount,
        tenderedAmount: payment.tenderedAmount,
        createdAt: payment.createdAt,
      },
    };
  });
}
