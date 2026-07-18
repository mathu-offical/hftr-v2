'use client';

import type { MarketHubSources } from '@hftr/contracts';
import { formatOrientation } from '@/components/panels/market-posture-format';

/**
 * Lists provider surfaces Market posture / movers compound pulls from (D-103).
 * Text-first: ready vs missing_key; contributed kinds called out.
 */
export function MarketPostureSourcesStrip(props: {
  sources: MarketHubSources;
  compact?: boolean;
}) {
  const ready = props.sources.lanes.filter((l) => l.status === 'ready');
  const missing = props.sources.lanes.filter((l) => l.status === 'missing_key');
  const pulling = props.sources.lanes.filter((l) => l.contributed);
  const pullingLabels =
    pulling.length > 0
      ? pulling.map((l) => l.label)
      : props.sources.contributedKinds.map((k) => k.replace(/_/g, ' '));

  if (props.compact) {
    return (
      <div data-testid="market-posture-sources" className="space-y-0.5">
        <p className="font-mono text-[9px] text-[var(--color-ink-faint)]">
          Pulling:{' '}
          {pullingLabels.length > 0 ? pullingLabels.join(' · ') : 'none sealed yet'}
        </p>
        <p className="font-mono text-[9px] text-[var(--color-ink-faint)]">
          Ready {ready.length}/{props.sources.lanes.length}
          {missing.length > 0 ? ` · need key ${missing.length}` : ''}
          {` · marks ${props.sources.markFeedClass}`}
        </p>
      </div>
    );
  }

  return (
    <section
      data-testid="market-posture-sources"
      className="rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5"
      aria-label="Market posture data sources"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Provider surfaces
        </h3>
        <span className="font-mono text-[9px] text-[var(--color-ink-faint)]">
          Marks {props.sources.markFeedClass}
          {props.sources.scannedAt
            ? ` · scanned ${formatOrientation(props.sources.scannedAt)}`
            : ''}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-[var(--color-ink-dim)]">
        Pulling from:{' '}
        {pullingLabels.length > 0 ? (
          <span className="text-[var(--color-ink)]">{pullingLabels.join(' · ')}</span>
        ) : (
          <span className="text-[var(--color-ink-faint)]">
            no sealed contribution yet — Refresh runs entitled lanes
          </span>
        )}
      </p>
      <ul className="mt-2 flex flex-wrap gap-1">
        {props.sources.lanes.map((lane) => {
          const tone =
            lane.contributed
              ? 'border-[var(--color-accent)] text-[var(--color-ink)]'
              : lane.status === 'ready'
                ? 'border-[var(--color-line)] text-[var(--color-ink-dim)]'
                : 'border-[var(--color-line)] text-[var(--color-ink-faint)] opacity-70';
          return (
            <li key={lane.kind}>
              <span
                className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[9px] ${tone}`}
                title={`${lane.domain} · ${lane.authMode} · ${lane.status}${lane.contributed ? ' · contributed' : ''}`}
              >
                {lane.label}
                {lane.contributed ? ' ✓' : lane.status === 'missing_key' ? ' · key' : ''}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
