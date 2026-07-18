'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MarketHubResponse } from '@hftr/contracts';
import { api, RequestError } from '@/lib/client';

function dollarsFromCents(cents: number | string): string {
  const n = typeof cents === 'string' ? Number(cents) : cents;
  if (!Number.isFinite(n)) return '—';
  return `$${(n / 100).toFixed(2)}`;
}

function pnlLabel(centsStr: string): string {
  const n = Number(centsStr);
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${(n / 100).toFixed(2)}`;
}

/**
 * Left-panel Market posture hub (D-081): movers, watchlists, trends, positions,
 * and continuation/exit stubs. Polls while mounted; Refresh enqueues movers.
 */
export function MarketPosturePanel(props: { companyId: string }) {
  const [hub, setHub] = useState<MarketHubResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!props.companyId) return;
    try {
      const data = await api<MarketHubResponse>(`/api/companies/${props.companyId}/market-hub`);
      setHub(data);
      setError(null);
    } catch (err) {
      const msg = err instanceof RequestError ? err.message : 'Failed to load market posture';
      setError(msg);
    }
  }, [props.companyId]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 20_000);
    return () => clearInterval(interval);
  }, [load]);

  const onRefresh = async () => {
    if (!props.companyId || refreshing) return;
    setRefreshing(true);
    try {
      await api(`/api/companies/${props.companyId}/market-hub`, { method: 'POST' });
      await load();
    } catch (err) {
      const msg = err instanceof RequestError ? err.message : 'Refresh failed';
      setError(msg);
    } finally {
      setRefreshing(false);
    }
  };

  if (error && !hub) {
    return <p className="text-xs text-[var(--color-negative)]">{error}</p>;
  }

  if (!hub) {
    return <p className="text-[10px] text-[var(--color-ink-faint)]">Loading market posture…</p>;
  }

  const moversStatusLabel =
    hub.movers.status === 'ready'
      ? 'Ready'
      : hub.movers.status === 'expired'
        ? 'Expired'
        : 'No seal yet';

  return (
    <div className="space-y-4" data-testid="market-posture-panel">
      <section className="rounded-lg border border-[var(--color-line)] p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
              Freshness
            </h3>
            <p className="mt-1 text-xs text-[var(--color-ink-dim)]">
              Movers: {moversStatusLabel}
              {hub.freshness.moversExpiresAt
                ? ` · expires ${new Date(hub.freshness.moversExpiresAt).toLocaleString()}`
                : ''}
            </p>
            <p className="text-[10px] text-[var(--color-ink-faint)]">
              Fetched {new Date(hub.freshness.fetchedAt).toLocaleString()}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onRefresh()}
            disabled={refreshing}
            className="rounded border border-[var(--color-line)] px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] disabled:opacity-50"
          >
            {refreshing ? 'Refreshing…' : 'Refresh posture'}
          </button>
        </div>
        {error ? <p className="mt-2 text-[10px] text-[var(--color-negative)]">{error}</p> : null}
      </section>

      <section>
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Baseline movers
        </h3>
        {hub.movers.status !== 'ready' || hub.movers.items.length === 0 ? (
          <p className="mt-1 text-xs text-[var(--color-ink-faint)]">
            No movers seal yet. Refresh posture or wait for the daily system movers job.
          </p>
        ) : (
          <ul className="mt-1 space-y-1.5">
            {hub.movers.items.map((item, i) => (
              <li
                key={`${item.symbolOrSector ?? 'item'}-${i}`}
                className="rounded border border-[var(--color-line)] px-2 py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[var(--color-ink)]">
                    {item.symbolOrSector ?? 'Cluster'}
                  </span>
                  <span className="text-[10px] uppercase text-[var(--color-ink-faint)]">
                    {[item.directionBand, item.strengthBand].filter(Boolean).join(' · ') ||
                      'band n/a'}
                  </span>
                </div>
                {item.headline ? (
                  <p className="mt-0.5 text-[11px] text-[var(--color-ink-dim)]">{item.headline}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {hub.movers.corroborationBand ? (
          <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">
            Corroboration: {hub.movers.corroborationBand}
          </p>
        ) : null}
      </section>

      <section>
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Watchlists
        </h3>
        {hub.watchlists.length === 0 ? (
          <p className="mt-1 text-xs text-[var(--color-ink-faint)]">
            No watchlist symbols. Add from a trading or trend module.
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {hub.watchlists.map((w) => (
              <li
                key={w.id}
                className="flex items-center justify-between gap-2 rounded border border-[var(--color-line)] px-2 py-1 text-xs"
              >
                <span>
                  <span className="font-medium">{w.symbol}</span>
                  <span className="ml-1.5 text-[10px] text-[var(--color-ink-faint)]">
                    {w.moduleName}
                    {w.moduleType ? ` · ${w.moduleType}` : ''}
                  </span>
                </span>
                <span className="text-[10px] uppercase text-[var(--color-ink-faint)]">
                  {w.bias} · {w.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Active trend candidates
        </h3>
        {hub.trendCandidates.length === 0 ? (
          <p className="mt-1 text-xs text-[var(--color-ink-faint)]">
            No trend candidates yet. Run a trend scan from a trend module.
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {hub.trendCandidates.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2 rounded border border-[var(--color-line)] px-2 py-1 text-xs"
              >
                <span>
                  <span className="font-medium">{t.symbol}</span>
                  <span className="ml-1.5 text-[10px] text-[var(--color-ink-faint)]">
                    {t.direction} · {t.strengthBand}
                  </span>
                </span>
                <span className="text-[10px] uppercase text-[var(--color-ink-faint)]">
                  {t.status}
                  {t.tradingModuleId ? ' · bound' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Open positions
        </h3>
        <p className="mt-0.5 text-[10px] text-[var(--color-ink-faint)]">
          Marks are synthetic until live broker marks ship.
        </p>
        {hub.positions.length === 0 ? (
          <p className="mt-1 text-xs text-[var(--color-ink-faint)]">No open positions.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {hub.positions.map((p) => (
              <li
                key={p.id}
                className="rounded border border-[var(--color-line)] px-2 py-1.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{p.symbol}</span>
                  <span className="font-mono tabular-nums text-[var(--color-ink-dim)]">
                    qty {p.qty}
                  </span>
                </div>
                <div className="mt-0.5 flex justify-between text-[10px] text-[var(--color-ink-faint)]">
                  <span>
                    avg {dollarsFromCents(p.avgCostCents)} · mark {dollarsFromCents(p.markCents)}
                  </span>
                  <span className="font-mono tabular-nums">
                    uPnL {pnlLabel(p.unrealizedPnlCents)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Continuation / exit
        </h3>
        {hub.pipeline.length === 0 ? (
          <p className="mt-1 text-xs text-[var(--color-ink-faint)]">
            No lead or decision-tree plans yet. Promote an admitted trend to populate.
          </p>
        ) : (
          <ul className="mt-1 space-y-1.5">
            {hub.pipeline.map((row) => (
              <li
                key={row.symbol}
                className="rounded border border-[var(--color-line)] px-2 py-1.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{row.symbol}</span>
                  <span className="text-[10px] uppercase text-[var(--color-ink-faint)]">
                    {row.lead?.status ?? 'no lead'}
                    {row.tree ? ` · tree ${row.tree.status}` : ''}
                  </span>
                </div>
                {row.lead ? (
                  <p className="mt-0.5 text-[10px] text-[var(--color-ink-dim)]">
                    Lead {row.lead.direction} · {row.lead.strategyFamily}
                  </p>
                ) : null}
                {row.tree && row.tree.recoveryLadder.length > 0 ? (
                  <p className="mt-0.5 text-[10px] text-[var(--color-ink-faint)]">
                    Recovery ladder: {row.tree.recoveryLadder.join(' → ')}
                  </p>
                ) : (
                  <p className="mt-0.5 text-[10px] text-[var(--color-ink-faint)]">
                    No recovery ladder recorded.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
