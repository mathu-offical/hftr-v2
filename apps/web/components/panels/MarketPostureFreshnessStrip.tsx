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

  if (props.compact) {
    return (
      <p
        data-testid="market-posture-freshness"
        className="font-mono text-[9px] tabular-nums text-[var(--color-ink-faint)]"
      >
        Fetched {fetched}
        {moversExp ? ` · movers exp ${moversExp}` : ''}
      </p>
    );
  }

  return (
    <p
      data-testid="market-posture-freshness"
      className="font-mono text-[10px] tabular-nums text-[var(--color-ink-faint)]"
    >
      Hub fetched {fetched}
      {moversExp ? ` · movers seal expires ${moversExp}` : ' · no movers expiry'}
    </p>
  );
}
