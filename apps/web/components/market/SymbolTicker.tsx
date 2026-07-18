'use client';

import type { MarketHubSymbolViz } from '@hftr/contracts';
import type { ReactNode } from 'react';
import { SparklineSvg } from '@/components/market/SparklineSvg';
import {
  directionGlyph,
  dollarsFromCents,
  heldSparkStroke,
  pnlLabel,
  pnlToneClass,
  relevanceTickFill,
  strengthTicksDisplay,
} from '@/components/panels/market-posture-format';

/**
 * Universal symbol ticker (D-109).
 * Held P&L color wins; every cue also has non-color text/glyph/ticks.
 */
export function SymbolTicker(props: {
  viz: MarketHubSymbolViz;
  density?: 'compact' | 'comfortable';
  meta?: ReactNode;
  className?: string;
}) {
  const { viz } = props;
  const compact = props.density === 'compact';
  const values = viz.spark.points.map((p) => Number(p.valueCents));
  const heldWins = viz.heldVsCost != null;
  const sparkStroke = heldWins
    ? heldSparkStroke(viz.heldVsCost)
    : 'var(--color-ink-dim)';
  const tickFill = heldWins
    ? 'var(--color-ink-faint)'
    : relevanceTickFill(viz.relevanceBand);
  const glyph = directionGlyph(viz.direction);
  const ticks = strengthTicksDisplay(viz.strengthTicks);

  return (
    <div
      data-testid="symbol-ticker"
      data-symbol={viz.symbol}
      data-held={heldWins ? '1' : '0'}
      className={`flex min-w-0 items-center gap-2 ${props.className ?? ''}`}
    >
      <SparklineSvg
        values={values}
        width={compact ? 48 : 72}
        height={compact ? 16 : 22}
        stroke={sparkStroke}
        aria-label={`${viz.symbol} ${viz.direction} spark (${viz.spark.feedClass})`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className={`font-medium tabular-nums text-[var(--color-ink)] ${compact ? 'text-xs' : 'text-sm'}`}>
            {viz.symbol}
          </span>
          <span
            className="font-mono text-[10px] text-[var(--color-ink-dim)]"
            title={`Direction ${viz.direction}`}
          >
            {glyph} {viz.direction}
          </span>
          <span
            className="font-mono text-[10px] tracking-widest"
            style={{ color: tickFill }}
            title={`Strength ${viz.strengthBand} · relevance ${viz.relevanceBand}`}
          >
            {ticks}
            <span className="ml-1 tracking-normal text-[var(--color-ink-faint)]">
              {viz.strengthBand}
            </span>
          </span>
        </div>
        <p
          className={`font-mono tabular-nums text-[var(--color-ink-faint)] ${compact ? 'text-[9px]' : 'text-[10px]'}`}
        >
          {viz.markCents != null ? `mark ${dollarsFromCents(viz.markCents)}` : 'mark —'}
          {viz.avgCostCents != null ? ` · held ${dollarsFromCents(viz.avgCostCents)}` : ''}
          {viz.unrealizedPnlCents != null ? (
            <span className={pnlToneClass(viz.heldVsCost)}>
              {' '}
              · uPnL {pnlLabel(viz.unrealizedPnlCents)}
            </span>
          ) : (
            <span>
              {' '}
              · rel {viz.relevanceBand}
            </span>
          )}
        </p>
        {props.meta ? <div className="mt-0.5">{props.meta}</div> : null}
      </div>
    </div>
  );
}
