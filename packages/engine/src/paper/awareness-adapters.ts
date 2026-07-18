import type { Clock } from '../clock';
import type { ResolvedMarketQuote } from './market-model';

/**
 * Awareness adapters (D-122 Phase 2): project MarketModel into posture hub +
 * current-awareness surfaces without a paper-only fork. Orientation only —
 * no raw financial digits for LLM paths.
 */

export type AwarenessSurfaceId =
  | 'market_posture_hub'
  | 'current_awareness_topics'
  | 'extensible';

export interface MarketAwarenessProjection {
  surface: AwarenessSurfaceId;
  /** Symbols observed in this projection window. */
  symbols: string[];
  /** Distinct feedClass labels (honest entitlement strings). */
  feedClasses: string[];
  usedLiveCount: number;
  syntheticCount: number;
  asOfIso: string;
  /** Text-first orientation notes — no dollar amounts. */
  notes: string[];
}

export function projectMarketModelToAwareness(
  resolved: readonly ResolvedMarketQuote[],
  clock: Clock,
): MarketAwarenessProjection[] {
  const symbols = [...new Set(resolved.map((r) => r.quote.symbol.toUpperCase()))].sort();
  const feedClasses = [
    ...new Set(resolved.map((r) => r.quote.feedClass).filter(Boolean)),
  ].sort();
  const usedLiveCount = resolved.filter((r) => r.usedLive).length;
  const syntheticCount = resolved.length - usedLiveCount;
  const asOfIso = clock.nowIso();

  const sharedNotes = [
    usedLiveCount > 0
      ? `Live market model active for ${usedLiveCount} of ${resolved.length} symbols`
      : 'Market model on synthetic fallback — entitle a live hydrator for realism',
    syntheticCount > 0
      ? `${syntheticCount} symbol(s) using synthetic_sim feedClass`
      : 'All observed symbols use non-synthetic feeds',
  ];

  return [
    {
      surface: 'market_posture_hub',
      symbols,
      feedClasses,
      usedLiveCount,
      syntheticCount,
      asOfIso,
      notes: [
        ...sharedNotes,
        'Posture hub should consume the same MarketModel marks as paper dispatch',
      ],
    },
    {
      surface: 'current_awareness_topics',
      symbols,
      feedClasses,
      usedLiveCount,
      syntheticCount,
      asOfIso,
      notes: [
        ...sharedNotes,
        'Current awareness topics share this substrate — no separate paper awareness fork',
      ],
    },
  ];
}
