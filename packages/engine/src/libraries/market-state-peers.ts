/**
 * Sector / breadth peer symbols for diversified movers universe (D-183).
 * Model-free orientation lists — not trading advice.
 */

/** Liquid breadth + sector ETFs used as market-state anchors. */
export const DIVERSIFIED_MARKET_ANCHORS = [
  'SPY',
  'QQQ',
  'IWM',
  'DIA',
  'XLF',
  'XLK',
  'XLE',
  'XLV',
  'XLI',
  'XLY',
  'XLP',
  'XLU',
  'XLB',
  'XLRE',
  'GLD',
  'TLT',
  'HYG',
  'UUP',
] as const;

/** Map company sector focus keys → peer / sector ETF symbols. */
export const SECTOR_FOCUS_PEER_SYMBOLS: Record<string, readonly string[]> = {
  technology: ['XLK', 'SOXX', 'SMH', 'QQQ'],
  information_technology: ['XLK', 'SOXX', 'SMH'],
  financials: ['XLF', 'KRE', 'KBE'],
  energy: ['XLE', 'XOP', 'OIH'],
  healthcare: ['XLV', 'IBB', 'XBI'],
  health_care: ['XLV', 'IBB', 'XBI'],
  industrials: ['XLI', 'IYT'],
  consumer_discretionary: ['XLY', 'XRT'],
  consumer_staples: ['XLP'],
  utilities: ['XLU'],
  materials: ['XLB'],
  real_estate: ['XLRE', 'IYR'],
  communication_services: ['XLC'],
  communications: ['XLC'],
};

export function sectorPeersForFocuses(focuses: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of focuses) {
    const key = raw.trim().toLowerCase().replace(/\s+/g, '_');
    const peers = SECTOR_FOCUS_PEER_SYMBOLS[key] ?? SECTOR_FOCUS_PEER_SYMBOLS[raw.trim().toLowerCase()];
    if (!peers) continue;
    for (const sym of peers) {
      const u = sym.toUpperCase();
      if (seen.has(u)) continue;
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}
