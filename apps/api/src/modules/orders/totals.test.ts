import { describe, expect, it } from 'vitest';
import { calculateOrderTotals } from './totals.js';

describe('calculateOrderTotals', () => {
  it('with no lines, everything is zero', () => {
    expect(calculateOrderTotals([])).toEqual({ subtotal: 0, taxTotal: 0, total: 0 });
  });

  it('applies a single line’s own tax rate to its own subtotal', () => {
    const totals = calculateOrderTotals([
      { unitPrice: 100, quantity: 2, modifierPriceDeltas: [], taxRate: 0.18 },
    ]);
    expect(totals).toEqual({ subtotal: 200, taxTotal: 36, total: 236 });
  });

  it('sums per-line tax across lines with different rates instead of blending them', () => {
    const totals = calculateOrderTotals([
      { unitPrice: 100, quantity: 1, modifierPriceDeltas: [], taxRate: 0.18 },
      { unitPrice: 50, quantity: 1, modifierPriceDeltas: [], taxRate: 0 },
    ]);
    expect(totals).toEqual({ subtotal: 150, taxTotal: 18, total: 168 });
  });

  it('includes modifier price deltas in the taxable base', () => {
    const totals = calculateOrderTotals([
      { unitPrice: 100, quantity: 1, modifierPriceDeltas: [25], taxRate: 0.18 },
    ]);
    expect(totals.subtotal).toBe(125);
    expect(totals.taxTotal).toBeCloseTo(22.5, 4);
    expect(totals.total).toBeCloseTo(147.5, 4);
  });
});
