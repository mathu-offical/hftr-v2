'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MarketHubResponse } from '@hftr/contracts';
import { api, RequestError } from '@/lib/client';
import {
  useMarketPostureView,
  type MarketPostureCategory,
} from '@/components/panels/MarketPostureViewContext';

const CATEGORIES: { id: MarketPostureCategory; label: string }[] = [
  { id: 'positions', label: 'Positions' },
  { id: 'watchlists', label: 'Watchlists' },
  { id: 'trends', label: 'Trends' },
  { id: 'pipeline', label: 'Plans' },
];

/**
 * Left-panel navigator for Market posture (D-082). Main dashboard lives in
 * MarketPostureOverlay; this rail lists company-wide persisted categories.
 */
export function MarketPosturePanel(props: { companyId: string }) {
  const mp = useMarketPostureView();
  const [hub, setHub] = useState<MarketHubResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!props.companyId) return;
    try {
      const data = await api<MarketHubResponse>(`/api/companies/${props.companyId}/market-hub`);
      setHub(data);
      setError(null);
    } catch (err) {
      setError(err instanceof RequestError ? err.message : 'Failed to load');
    }
  }, [props.companyId]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 20_000);
    return () => clearInterval(interval);
  }, [load]);

  if (error && !hub) {
    return <p className="text-xs text-[var(--color-negative)]">{error}</p>;
  }

  if (!hub) {
    return <p className="text-[10px] text-[var(--color-ink-faint)]">Loading…</p>;
  }

  const counts: Record<MarketPostureCategory, number> = {
    positions: hub.positions.length,
    watchlists: hub.watchlists.length,
    trends: hub.trendCandidates.length,
    pipeline: hub.pipeline.length,
  };

  return (
    <div className="space-y-3" data-testid="market-posture-panel">
      <p className="text-[10px] text-[var(--color-ink-faint)]">
        Dashboard opens over the canvas. Select a holding to focus the equity chart.
      </p>

      <div className="flex flex-wrap gap-1">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => mp.setCategory(c.id)}
            className={`rounded px-2 py-1 text-[10px] uppercase tracking-wider ${
              mp.category === c.id
                ? 'bg-[var(--color-surface-2)] text-[var(--color-ink)]'
                : 'text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
            }`}
          >
            {c.label} ({counts[c.id]})
          </button>
        ))}
      </div>

      {mp.category === 'positions' && (
        <ul className="space-y-1">
          {hub.positions.length === 0 ? (
            <li className="text-xs text-[var(--color-ink-faint)]">No open positions</li>
          ) : (
            hub.positions.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    mp.selectPosition(mp.selectedPositionId === p.id ? null : p.id, p.symbol);
                    mp.openOverlay();
                  }}
                  className={`w-full rounded border px-2 py-1.5 text-left text-xs ${
                    mp.selectedPositionId === p.id
                      ? 'border-[var(--color-accent)] bg-[var(--color-surface-2)]'
                      : 'border-[var(--color-line)] hover:border-[var(--color-ink-faint)]'
                  }`}
                >
                  <div className="flex justify-between">
                    <span className="font-medium">{p.symbol}</span>
                    <span className="font-mono tabular-nums text-[var(--color-ink-faint)]">
                      {p.qty}
                    </span>
                  </div>
                  {p.engines.length > 0 ? (
                    <p className="mt-0.5 truncate text-[10px] text-[var(--color-ink-faint)]">
                      {p.engines.map((e) => e.label).join(' · ')}
                    </p>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      {mp.category === 'watchlists' && (
        <ul className="space-y-1 text-xs">
          {hub.watchlists.length === 0 ? (
            <li className="text-[var(--color-ink-faint)]">No watchlists</li>
          ) : (
            hub.watchlists.map((w) => (
              <li key={w.id} className="rounded border border-[var(--color-line)] px-2 py-1">
                <span className="font-medium">{w.symbol}</span>
                <span className="ml-1 text-[10px] text-[var(--color-ink-faint)]">
                  {w.bias} · {w.moduleName}
                </span>
              </li>
            ))
          )}
        </ul>
      )}

      {mp.category === 'trends' && (
        <ul className="space-y-1 text-xs">
          {hub.trendCandidates.length === 0 ? (
            <li className="text-[var(--color-ink-faint)]">No trends</li>
          ) : (
            hub.trendCandidates.map((t) => (
              <li key={t.id} className="rounded border border-[var(--color-line)] px-2 py-1">
                <span className="font-medium">{t.symbol}</span>
                <span className="ml-1 text-[10px] text-[var(--color-ink-faint)]">
                  {t.direction} · {t.status}
                </span>
              </li>
            ))
          )}
        </ul>
      )}

      {mp.category === 'pipeline' && (
        <ul className="space-y-1 text-xs">
          {hub.pipeline.length === 0 ? (
            <li className="text-[var(--color-ink-faint)]">No plans</li>
          ) : (
            hub.pipeline.map((row) => (
              <li key={row.symbol} className="rounded border border-[var(--color-line)] px-2 py-1">
                <span className="font-medium">{row.symbol}</span>
                <span className="ml-1 text-[10px] text-[var(--color-ink-faint)]">
                  {row.lead?.status ?? 'no lead'}
                </span>
              </li>
            ))
          )}
        </ul>
      )}

      <p className="text-[10px] text-[var(--color-ink-faint)]">
        Equity {hub.equity.status}
        {hub.equity.equityCents ? ` · $${(Number(hub.equity.equityCents) / 100).toFixed(2)}` : ''}
      </p>
    </div>
  );
}
