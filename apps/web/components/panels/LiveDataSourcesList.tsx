'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  isActiveLiveDataSource,
  type LiveDataSourceRow,
  type LiveDataSourcesResponse,
} from '@hftr/contracts';
import { api, RequestError } from '@/lib/client';
import { useDataView } from '@/components/panels/DataViewContext';
import {
  invalidateLiveDataSources,
  loadLiveDataSources,
  peekLiveDataSources,
} from '@/lib/live-data-sources-cache';

function activeSources(rows: LiveDataSourceRow[]): LiveDataSourceRow[] {
  return rows.filter(isActiveLiveDataSource);
}

/**
 * DATA tab — credential-ready / public API sources only (D-121).
 * Metadata is SWR-cached; live query happens in Data Explorer.
 */
export function LiveDataSourcesList(props: {
  companyId: string;
  /** Existing live_api modules (for place feedback). */
  liveApiModules: Array<{ id: string; name: string; config: Record<string, unknown> }>;
}) {
  const dataView = useDataView();
  const selectedKind =
    dataView.overlayOpen && dataView.target?.type === 'live_source'
      ? dataView.target.kind
      : null;
  const [sources, setSources] = useState<LiveDataSourceRow[]>(() => {
    const peek = peekLiveDataSources({ companyId: props.companyId });
    return peek ? activeSources(peek.sources) : [];
  });
  const [loaded, setLoaded] = useState(
    () => peekLiveDataSources({ companyId: props.companyId }) !== null,
  );
  const [error, setError] = useState<string | null>(null);
  const [placingKind, setPlacingKind] = useState<string | null>(null);
  const [placeMessage, setPlaceMessage] = useState<string | null>(null);

  const load = useCallback(
    async (force = false) => {
      if (!props.companyId) return;
      try {
        const result = await loadLiveDataSources(
          { companyId: props.companyId },
          () =>
            api<LiveDataSourcesResponse>(
              `/api/companies/${props.companyId}/live-data-sources`,
            ),
          {
            force,
            allowStale: true,
            onUpdate: (data) => setSources(activeSources(data.sources)),
          },
        );
        setSources(activeSources(result.data.sources));
        setError(null);
      } catch {
        setError('Could not load live data sources.');
        if (peekLiveDataSources({ companyId: props.companyId }) === null) {
          setSources([]);
        }
      } finally {
        setLoaded(true);
      }
    },
    [props.companyId],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  async function placeOnCanvas(source: LiveDataSourceRow) {
    setPlacingKind(source.kind);
    setPlaceMessage(null);
    const venue = source.kind.startsWith('alpaca') ? 'alpaca' : 'paper_sim';
    try {
      await api(`/api/companies/${props.companyId}/modules`, {
        method: 'POST',
        body: {
          type: 'live_api',
          name: source.label,
          config: {
            sourceKind: source.kind,
            venue,
            instruments: ['SPY'],
            feedClass: source.feedClass,
            pollSeconds: 60,
          },
          canvasPosition: { x: 80, y: 120 + Math.random() * 40 },
        },
      });
      invalidateLiveDataSources({ companyId: props.companyId });
      setPlaceMessage(`Placed ${source.label} — reloading canvas…`);
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setPlaceMessage(
        err instanceof RequestError ? `Place failed (${err.status}).` : 'Place failed.',
      );
    } finally {
      setPlacingKind(null);
    }
  }

  return (
    <section data-testid="live-data-sources" aria-label="Live data sources">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-ink-faint)]">
          Live data sources
        </p>
        <button
          type="button"
          onClick={() => void load(true)}
          className="shrink-0 rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[10px] text-[var(--color-ink-dim)] hover:border-[var(--color-accent)]"
        >
          Refresh
        </button>
      </div>
      {placeMessage ? (
        <p className="mt-2 text-[10px] text-[var(--color-ink-dim)]">{placeMessage}</p>
      ) : null}
      {!loaded ? (
        <p className="mt-3 text-[11px] text-[var(--color-ink-faint)]">Loading…</p>
      ) : error ? (
        <p className="mt-3 text-[11px] text-[var(--color-ink-faint)]">{error}</p>
      ) : sources.length === 0 ? (
        <p className="mt-3 text-[11px] text-[var(--color-ink-faint)]">
          No active sources. Add and verify API keys in Settings.
        </p>
      ) : (
        <ul className="mt-3 space-y-2" role="listbox" aria-label="Active API sources">
          {sources.map((s) => {
            const selected = selectedKind === s.kind;
            return (
              <li
                key={s.kind}
                className={`rounded-lg border p-2.5 transition-colors ${
                  selected
                    ? 'border-[var(--color-accent)] bg-[var(--color-surface-2)] ring-1 ring-[var(--color-accent)]'
                    : 'border-[var(--color-line)] bg-[var(--color-surface-1)]'
                }`}
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-testid={`live-data-source-${s.kind}`}
                  data-selected={selected ? 'true' : 'false'}
                  onClick={() => dataView.selectLiveSource(s.kind, s.label)}
                  className="w-full text-left"
                >
                  <span className="block truncate text-xs font-medium text-[var(--color-ink)]">
                    {s.label}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-[var(--color-ink-faint)]">
                    {s.domain}
                    {s.canvasModuleIds.length > 0 ? ' · on canvas' : ''}
                  </span>
                </button>
                <div className="mt-2">
                  <button
                    type="button"
                    disabled={placingKind === s.kind}
                    onClick={() => void placeOnCanvas(s)}
                    className="rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[10px] text-[var(--color-ink-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-ink)] disabled:opacity-50"
                  >
                    {placingKind === s.kind ? 'Placing…' : 'Place on canvas'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
