/**
 * Fee helpers for paper/live fills — ledger kind `fee` and measurable-gain floors.
 */

/** Fee cents for a one-way fill at feeBps of notional (min 1¢ when notional > 0). */
export function feeCentsFromNotional(notionalCents: number, feeBps: number): number {
  if (!Number.isFinite(notionalCents) || notionalCents <= 0) return 0;
  if (!Number.isFinite(feeBps) || feeBps <= 0) return 0;
  return Math.max(1, Math.floor((notionalCents * feeBps) / 10_000));
}

/**
 * Implied round-trip fee bps from sum of fee ledger cents vs trade notional.
 * Falls back when notional missing.
 */
export function roundTripFeeBpsFromAmounts(
  feeSumCents: number,
  tradeNotionalCents: number,
  fallbackBps: number,
): number {
  if (
    !Number.isFinite(feeSumCents) ||
    feeSumCents <= 0 ||
    !Number.isFinite(tradeNotionalCents) ||
    tradeNotionalCents <= 0
  ) {
    return fallbackBps;
  }
  return Math.max(1, Math.round((feeSumCents * 10_000) / tradeNotionalCents));
}
