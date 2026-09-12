import { z } from 'zod';

const decimalString = z.string().regex(/^\d+(\.\d{1,4})?$/, 'Expected a decimal string');

export const addPaymentBodySchema = z.object({
  paymentMethodId: z.number().int().positive(),
  amount: decimalString,
  tipAmount: decimalString.default('0'),
  tenderedAmount: decimalString.optional(),
});
