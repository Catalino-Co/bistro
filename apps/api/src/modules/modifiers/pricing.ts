/**
 * Pure line-total calculation, with no DB/HTTP involved -- the point of
 * B1-4 is that a modifier's price_delta actually changes what a line
 * costs, unlike the legacy's garnitures/cook_terms, which had no price
 * column at all. Order-taking (B1-7) will call this same function once
 * order lines exist; it's tested standalone here since that's what's
 * actually being proven right now.
 */
export function calculateLineTotal(
  unitPrice: number,
  quantity: number,
  modifierPriceDeltas: number[],
): number {
  const perUnit = unitPrice + modifierPriceDeltas.reduce((sum, delta) => sum + delta, 0);
  return Math.round(perUnit * quantity * 10000) / 10000;
}
