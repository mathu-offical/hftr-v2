'use client';

import type { MarketHubResponse } from '@hftr/contracts';
import { Justification } from '@/components/panels/Justification';
import {
  formatOrientation,
  reportKindLabel,
} from '@/components/panels/market-posture-format';

/**
 * Compact seal + MarketModel awareness under the Model canvas (D-120 / D-122).
 * Surfaces what Analyze sealed and shared MarketModel feed honesty on the day overlay.
 */
export function MarketPostureAwarenessDock(props: {
  hub: MarketHubResponse;
  onOpenConcept?: (conceptId: string) => void;
}) {
  const { hub, onOpenConcept } = props;
  const movers = hub.movers;
  const narrative = hub.reports.find((r) => r.kind === 'posture_narrative');
  const sector = hub.reports.find((r) => r.kind === 'sector_bulletin');
  const daily = hub.reports.find((r) => r.kind === 'daily_summary');
  const synth = hub.synthesis ?? {
    runId: null,
    status: null,
    narrativeConceptId: null,
    stagesDone: 0,
    stagesTotal: 0,
  };

  return (
    <div
      className="space-y-2 rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5"
      data-testid="market-posture-awareness-dock"
    >
      <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-dim)]">
        Baseline awareness
        {synth.runId
          ? ` · synth ${synth.status ?? '—'} ${synth.stagesDone}/${synth.stagesTotal}`
          : ' · no synthesis run'}
      </p>

      <ul className="space-y-1.5 text-[11px] text-[var(--color-ink)]">
        <li>
          <Justification
            sourceClass="system_seal"
            block
            lines={[
              movers.title ?? 'Movers board',
              `Status ${movers.status} · band ${movers.corroborationBand ?? '—'}`,
              movers.expiresAt
                ? `Expires ${formatOrientation(movers.expiresAt)}`
                : 'No movers expiry',
            ]}
          >
            <span className="font-medium">Movers</span>
            <span className="ml-1 font-mono text-[10px] text-[var(--color-ink-faint)]">
              {movers.status} · {movers.items.length} items · {movers.corroborationBand ?? '—'}
            </span>
          </Justification>
        </li>
        {hub.marketModelAwareness ? (
          <li data-testid="market-posture-market-model-awareness">
            <Justification
              sourceClass="derived"
              block
              lines={[
                ...hub.marketModelAwareness.notes,
                hub.marketModelAwareness.feedClasses.length > 0
                  ? `Feed classes: ${hub.marketModelAwareness.feedClasses.join(', ')}`
                  : 'No feed classes reported',
                `As of ${formatOrientation(hub.marketModelAwareness.asOfIso)}`,
              ]}
            >
              <span className="font-medium">Market model</span>
              <span className="ml-1 font-mono text-[10px] text-[var(--color-ink-faint)]">
                {hub.marketModelAwareness.usedLiveCount} live ·{' '}
                {hub.marketModelAwareness.syntheticCount} synthetic ·{' '}
                {hub.marketModelAwareness.symbols.length} symbols
              </span>
            </Justification>
          </li>
        ) : null}
        <li className="font-mono text-[10px] text-[var(--color-ink-faint)]">
          Freshness · movers {hub.freshness.moversExpiresAt ? formatOrientation(hub.freshness.moversExpiresAt) : '—'}
          {hub.freshness.sectorExpiresAt
            ? ` · sector ${formatOrientation(hub.freshness.sectorExpiresAt)}`
            : ''}
          {hub.freshness.dailyExpiresAt
            ? ` · daily ${formatOrientation(hub.freshness.dailyExpiresAt)}`
            : ''}
        </li>
      </ul>

      <div className="flex flex-wrap gap-1">
        {hub.reports.slice(0, 6).map((r) => (
          <button
            key={r.id}
            type="button"
            disabled={!onOpenConcept}
            onClick={() => onOpenConcept?.(r.id)}
            className="border border-[var(--color-line)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-50"
            title={r.title}
          >
            {r.kind === 'posture_narrative' ? 'Narrative' : reportKindLabel(r.kind)}
          </button>
        ))}
        {hub.reports.length === 0 ? (
          <span className="font-mono text-[9px] text-[var(--color-ink-faint)]">
            No sealed reports — Analyze to reseal
          </span>
        ) : null}
      </div>

      {!narrative && !sector && !daily ? null : (
        <p className="text-[10px] text-[var(--color-ink-faint)]">
          {narrative
            ? 'Narrative rollup includes book↔tape overlap (held/watch/pipeline vs movers).'
            : 'Narrative not projected yet — run Analyze.'}
        </p>
      )}
    </div>
  );
}
