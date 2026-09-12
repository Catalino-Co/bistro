import { calculateLineTotal } from '../modifiers/pricing.js';

export interface OrderLineForTotals {
  unitPrice: number;
  quantity: number;
  modifierPriceDeltas: number[];
  taxRate: number;
}

export interface OrderTotals {
  subtotal: number;
  taxTotal: number;
  total: number;
}

/**
 * Tax is computed per line (its own item's tax rate applied to that line's
 * own subtotal, rounded) and then summed -- not a single blended rate over
 * the whole order -- because an order can mix taxed and exempt items (see
 * tax_rates seed: "ITBIS 18%" and "Exento 0%"), and because a future NCF
 * fiscal receipt needs each line's own tax shown, not just an order total.
 */
export function calculateOrderTotals(lines: OrderLineForTotals[]): OrderTotals {
  let subtotal = 0;
  let taxTotal = 0;

  for (const line of lines) {
    const lineSubtotal = calculateLineTotal(
      line.unitPrice,
      line.quantity,
      line.modifierPriceDeltas,
    );
    const lineTax = Math.round(lineSubtotal * line.taxRate * 10000) / 10000;
    subtotal = Math.round((subtotal + lineSubtotal) * 10000) / 10000;
    taxTotal = Math.round((taxTotal + lineTax) * 10000) / 10000;
  }

  return { subtotal, taxTotal, total: Math.round((subtotal + taxTotal) * 10000) / 10000 };
}
