'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { MarketHubSources } from '@hftr/contracts';
import { formatOrientation } from '@/components/panels/market-posture-format';

/**
 * Provider status control (D-103 / D-148): header button opens a dropdown
 * with provider surfaces — ready / missing_key / contributed honesty.
 */
export function MarketPostureSourcesStrip(props: {
  sources: MarketHubSources;
  /** @deprecated Compact inline list — prefer the header dropdown. */
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
    <ProviderStatusDropdown
      sources={props.sources}
      readyCount={ready.length}
      missingCount={missing.length}
      pullingLabels={pullingLabels}
    />
  );
}

function ProviderStatusDropdown(props: {
  sources: MarketHubSources;
  readyCount: number;
  missingCount: number;
  pullingLabels: string[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const { sources, readyCount, missingCount, pullingLabels } = props;
  const total = sources.lanes.length;

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative" data-testid="market-posture-provider-status">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        title="Provider surfaces readiness and last sealed contributions"
        className={`border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${
          open
            ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
            : 'border-[var(--color-line)] text-[var(--color-ink-dim)] hover:border-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
        }`}
        data-testid="market-posture-provider-status-btn"
      >
        Provider status
        <span className="ml-1 tabular-nums text-[var(--color-ink-faint)]">
          {readyCount}/{total}
          {missingCount > 0 ? ` · ${missingCount} key` : ''}
        </span>
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Provider surfaces"
          data-testid="market-posture-sources"
          className="absolute right-0 top-full z-30 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5 shadow-lg"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
              Provider surfaces
            </h3>
            <span className="font-mono text-[9px] text-[var(--color-ink-faint)]">
              Marks {sources.markFeedClass}
              {sources.scannedAt ? ` · scanned ${formatOrientation(sources.scannedAt)}` : ''}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-ink-dim)]">
            Pulling from:{' '}
            {pullingLabels.length > 0 ? (
              <span className="text-[var(--color-ink)]">{pullingLabels.join(' · ')}</span>
            ) : (
              <span className="text-[var(--color-ink-faint)]">
                no sealed contribution yet — Sync / Analyze runs entitled lanes
              </span>
            )}
          </p>
          <ul className="mt-2 flex max-h-48 flex-wrap gap-1 overflow-y-auto">
            {sources.lanes.map((lane) => {
              const tone = lane.contributed
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
        </div>
      ) : null}
    </div>
  );
}
