/**
 * Strategy family id ↔ catalog name aliases for recovery ladder attachment.
 * Compile trees may pass strat-* ids; recovery templates applyTo family names.
 */

/** Catalog strategy id → recovery appliesTo family name. */
export const STRATEGY_FAMILY_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  'strat-001': 'opening_range_breakout',
  'strat-002': 'gap_and_go',
  'strat-005': 'vwap_reversion',
  'strat-007': 'market_making',
});

/** Prefer named family recovery; fall back through aliases then rec-001. */
export function resolveStrategyFamilyForRecovery(family: string): string {
  if (STRATEGY_FAMILY_ALIASES[family]) return STRATEGY_FAMILY_ALIASES[family]!;
  return family;
}
