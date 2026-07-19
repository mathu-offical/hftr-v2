'use client';

import type { ReactNode } from 'react';
import type { MarketHubAwarenessAnalysis } from '@hftr/contracts';

/**
 * Multi-level Market Posture awareness analysis (D-175).
 * Evidence → Links → Trends → Recommendations.
 */
export function MarketPostureAwarenessLevels(props: {
  analysis: MarketHubAwarenessAnalysis;
}) {
  const { analysis } = props;
  return (
    <section
      className="space-y-3 rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5"
      data-testid="market-posture-awareness-levels"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-1">
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Awareness levels · linkage hybrid
        </h3>
        <span className="font-mono text-[9px] text-[var(--color-ink-faint)]">
          {analysis.asOfIso
            ? `asOf ${new Date(analysis.asOfIso).toLocaleTimeString()}`
            : 'no seal asOf'}
        </span>
      </div>
      <p className="font-mono text-[9px] text-[var(--color-ink-dim)]">{analysis.coverageSummary}</p>

      <LevelBlock
        testId="market-posture-awareness-evidence"
        title="1 · Evidence"
        empty="No linked news/library packages"
        count={analysis.evidence.length}
      >
        {analysis.evidence.slice(0, 8).map((e) => (
          <li key={`${e.kind}-${e.id}`} className="flex justify-between gap-2 text-xs">
            <span className="truncate text-[var(--color-ink)]" title={e.label}>
              <span className="font-mono text-[9px] uppercase text-[var(--color-ink-faint)]">
                {e.kind.replace(/_/g, ' ')}
              </span>{' '}
              {e.label}
            </span>
            <span className="shrink-0 font-mono text-[9px] uppercase text-[var(--color-ink-faint)]">
              {e.linkedSymbolCount} sym · {e.strengthBand}
            </span>
          </li>
        ))}
      </LevelBlock>

      <LevelBlock
        testId="market-posture-awareness-links"
        title="2 · Links"
        empty="No awareness edges"
        count={analysis.links.length}
      >
        {analysis.links.slice(0, 12).map((l) => (
          <li key={l.id} className="flex justify-between gap-2 text-xs">
            <span className="truncate text-[var(--color-ink)]" title={l.fromLabel}>
              <span className="font-mono text-[9px] text-[var(--color-accent)]">{l.fromKind}</span>
              {' → '}
              <span className="font-mono text-[9px] text-[var(--color-ok)]">{l.toKind}</span> {l.toId}
            </span>
            <span className="shrink-0 font-mono text-[9px] uppercase text-[var(--color-ink-faint)]">
              {l.strengthBand}
            </span>
          </li>
        ))}
      </LevelBlock>

      <LevelBlock
        testId="market-posture-awareness-trends"
        title="3 · Trends"
        empty="No link-grounded trends"
        count={analysis.trends.length}
      >
        {analysis.trends.slice(0, 8).map((t) => (
          <li key={t.id} className="flex justify-between gap-2 text-xs">
            <span className="font-medium text-[var(--color-ink)]">
              {t.symbol}
              <span className="ml-1 font-mono text-[9px] font-normal uppercase text-[var(--color-ink-faint)]">
                {t.status}
                {t.label ? ` · ${t.label}` : ''}
              </span>
            </span>
            <span className="shrink-0 font-mono text-[9px] uppercase text-[var(--color-ink-faint)]">
              {t.linkStrengthBand}
            </span>
          </li>
        ))}
      </LevelBlock>

      <LevelBlock
        testId="market-posture-awareness-recommendations"
        title="4 · Recommendations"
        empty="No linked recommendations"
        count={analysis.recommendations.length}
      >
        {analysis.recommendations.slice(0, 10).map((r) => (
          <li key={r.id} className="flex justify-between gap-2 text-xs">
            <span className="text-[var(--color-ink)]">
              <span className="font-medium">{r.symbol}</span>
              <span className="ml-1 font-mono text-[9px] uppercase text-[var(--color-ink-faint)]">
                {r.tier.replace(/_/g, ' ')}
              </span>
              {r.note ? (
                <span className="mt-0.5 block truncate font-mono text-[9px] text-[var(--color-ink-dim)]">
                  {r.note}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 font-mono text-[9px] uppercase text-[var(--color-ink-faint)]">
              {[
                r.newsLinkBand ? `n:${r.newsLinkBand}` : null,
                r.libraryLinkBand ? `l:${r.libraryLinkBand}` : null,
                r.trendLinkBand ? `t:${r.trendLinkBand}` : null,
              ]
                .filter(Boolean)
                .join(' · ') || '—'}
            </span>
          </li>
        ))}
      </LevelBlock>
    </section>
  );
}

function LevelBlock(props: {
  title: string;
  testId: string;
  empty: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <div data-testid={props.testId}>
      <h4 className="mb-1 text-[9px] uppercase tracking-widest text-[var(--color-ink-faint)]">
        {props.title}
      </h4>
      {props.count === 0 ? (
        <p className="text-xs text-[var(--color-ink-faint)]">{props.empty}</p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-y-auto">{props.children}</ul>
      )}
    </div>
  );
}
