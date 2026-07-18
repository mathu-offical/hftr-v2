'use client';

import type { MarketHubFreshness } from '@hftr/contracts';
import { formatOrientation } from '@/components/panels/market-posture-format';

/**
 * Compact freshness strip for Market posture overlay header / rail footer.
 */
export function MarketPostureFreshnessStrip(props: {
  freshness: MarketHubFreshness;
  compact?: boolean;
}) {
  const fetched = formatOrientation(props.freshness.fetchedAt);
  const moversExp = props.freshness.moversExpiresAt
    ? formatOrientation(props.freshness.moversExpiresAt)
    : null;
  const sectorExp = props.freshness.sectorExpiresAt
    ? formatOrientation(props.freshness.sectorExpiresAt)
    : null;
  const dailyExp = props.freshness.dailyExpiresAt
    ? formatOrientation(props.freshness.dailyExpiresAt)
    : null;

  if (props.compact) {
    return (
      <p
        data-testid="market-posture-freshness"
        className="font-mono text-[9px] tabular-nums text-[var(--color-ink-faint)]"
      >
        Fetched {fetched}
        {moversExp ? ` · movers ${moversExp}` : ''}
        {sectorExp ? ` · sector ${sectorExp}` : ''}
        {dailyExp ? ` · daily ${dailyExp}` : ''}
      </p>
    );
  }

  return (
    <p
      data-testid="market-posture-freshness"
      className="font-mono text-[10px] tabular-nums text-[var(--color-ink-faint)]"
    >
      Hub fetched {fetched}
      {moversExp ? ` · movers expires ${moversExp}` : ' · no movers expiry'}
      {sectorExp ? ` · sector ${sectorExp}` : ''}
      {dailyExp ? ` · daily ${dailyExp}` : ''}
    </p>
  );
}
