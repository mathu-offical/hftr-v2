/**
 * Low-friction copy for paper vs live capital surfaces (D-167).
 * Text-first: mode word sits on the dollar label itself — no modal clutter.
 */

export type CapitalMode = 'paper' | 'live';

export function normalizeCapitalMode(mode: string | null | undefined): CapitalMode {
  return mode === 'live' ? 'live' : 'paper';
}

export function balanceLabel(mode: CapitalMode): string {
  return mode === 'live' ? 'Live balance' : 'Paper balance';
}

export function equityHeadline(mode: CapitalMode): string {
  return mode === 'live' ? 'Live equity' : 'Paper equity';
}

export function masterEquityHeadline(mode: CapitalMode): string {
  return mode === 'live' ? 'Live master equity' : 'Paper master equity';
}

export function fundsHeadline(mode: CapitalMode): string {
  return mode === 'live' ? 'Live funds' : 'Paper funds';
}

export function pnlHeadline(kind: 'realized' | 'unrealized', mode: CapitalMode): string {
  const prefix = mode === 'live' ? 'Live' : 'Paper';
  return kind === 'realized' ? `${prefix} realized PnL` : `${prefix} unrealized PnL`;
}

export function currentValueHeadline(mode: CapitalMode): string {
  return mode === 'live' ? 'Live equity' : 'Paper equity';
}

export function fundTransfersHeadline(mode: CapitalMode): string {
  return mode === 'live' ? 'Fund transfers' : 'Virtual fund transfers (paper)';
}

export function brokerBuyingPowerHeadline(brokerMode: CapitalMode): string {
  return brokerMode === 'paper' ? 'Paper broker buying power' : 'Live broker buying power';
}

/**
 * Compact chip next to execution fill amounts.
 * Prefers venue honesty tags (paper_sim / paper_proxy) over company mode alone.
 */
export function executionCapitalChip(mode: string, venue: string): string {
  const v = venue.toLowerCase();
  if (v === 'paper_sim') return 'paper sim';
  if (v.includes('paper_proxy') || v === 'paper_proxy') return 'paper proxy';
  if (v.includes('paper')) return 'paper';
  if (mode === 'paper') return 'paper';
  return 'live';
}
