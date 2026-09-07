import { describe, expect, it } from 'vitest';
import { calculateLineTotal } from './pricing.js';

describe('calculateLineTotal', () => {
  it('with no modifiers, is just unit price times quantity', () => {
    expect(calculateLineTotal(100, 2, [])).toBe(200);
  });

  it('a modifier with a positive price_delta adds to the line total', () => {
    const withoutModifier = calculateLineTotal(100, 1, []);
    const withModifier = calculateLineTotal(100, 1, [15]);
    expect(withModifier).toBeGreaterThan(withoutModifier);
    expect(withModifier).toBe(115);
  });

  it('multiplies the per-unit total (base + modifiers) by quantity', () => {
    expect(calculateLineTotal(100, 3, [15])).toBe(345);
  });

  it('a zero price_delta modifier does not change the total', () => {
    expect(calculateLineTotal(100, 1, [0])).toBe(calculateLineTotal(100, 1, []));
  });
});
