'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useResearchView } from '@/components/research/ResearchViewContext';
import { MarketPostureFreshnessStrip } from '@/components/panels/MarketPostureFreshnessStrip';
import { MarketPostureSourcesStrip } from '@/components/panels/MarketPostureSourcesStrip';
import { MarketPostureModelCanvas } from '@/components/panels/MarketPostureModelCanvas';
import { MarketPostureStageScreens } from '@/components/panels/MarketPostureStageScreens';
import { useMarketPostureView } from '@/components/panels/MarketPostureViewContext';
import {
  dollarsFromCents,
  moversAreStale,
} from '@/components/panels/market-posture-format';
import {
  watchlistMatchesTierFilter,
  type WatchlistTierFilter,
} from '@/components/panels/WatchlistTierFilters';
import { api } from '@/lib/client';
import { invalidateMarketHub } from '@/lib/market-hub-cache';
import { useMarketHub } from '@/lib/use-market-hub';
import { useMarketHubSynthesis } from '@/lib/use-market-hub-synthesis';
import type { MarketPostureStageScreenId } from '@/lib/market-posture-stage-screens';

const SYNTHESIS_TERMINAL = new Set(['succeeded', 'failed', 'partial']);

/**
 * Canvas overlay: day quant workspace (D-131 / D-186) —
 * horizontal stage screens above a fixed Model diagram strip.
 * Holdings inventory stays on the left Posture rail.
 */
export function MarketPostureOverlay() {
  const mp = useMarketPostureView();
  const research = useResearchView();
  const {
    data: hub,
    loading,
    refreshing,
    analyzing,
    lastAnalyzePhaseLabel,
    error,
    refresh,
    analyze,
  } = useMarketHub(mp.companyId, {
    enabled: true,
    poll: mp.overlayOpen,
  });
  const synthesis = useMarketHubSynthesis(mp.companyId, { enabled: mp.overlayOpen });
  const [watchlistTierFilter, setWatchlistTierFilter] = useState<WatchlistTierFilter>('default');
  const [dayLens, setDayLens] = useState<'both' | 'stock' | 'news'>('both');
  const lastTerminalRunId = useRef<string | null>(null);

  useEffect(() => {
    const run = synthesis.run;
    if (!run || !SYNTHESIS_TERMINAL.has(run.status)) return;
    if (lastTerminalRunId.current === run.id) return;
    lastTerminalRunId.current = run.id;
    void refresh(true);
  }, [synthesis.run, refresh]);

  const onAnalyze = useCallback(async () => {
    const runId = await analyze();
    if (runId) synthesis.setActiveRunId(runId);
  }, [analyze, synthesis.setActiveRunId]);

  const equityLabel = hub?.equity.equityCents
    ? dollarsFromCents(hub.equity.equityCents)
    : 'Unavailable';

  const filteredWatchlists = useMemo(() => {
    if (!hub) return [];
    return hub.watchlists.filter((w) => watchlistMatchesTierFilter(w.status, watchlistTierFilter));
  }, [hub, watchlistTierFilter]);

  const moversStale = hub
    ? moversAreStale({ status: hub.movers.status, expiresAt: hub.movers.expiresAt })
    : false;

  const openReport = (conceptId: string) => {
    research.openOverlay();
    research.inspectConcept(conceptId);
  };

  const confirmWatchlist = useCallback(
    async (itemId: string) => {
      await api(`/api/companies/${mp.companyId}/watchlists/${itemId}`, {
        method: 'PATCH',
        body: { status: 'watching' },
      });
      invalidateMarketHub({ companyId: mp.companyId });
      await refresh(true);
    },
    [mp.companyId, refresh],
  );

  const onModelNavigate = useCallback(
    (nodeId: string, screenId: MarketPostureStageScreenId) => {
      mp.setSelectedModelNodeId(nodeId);
      mp.setActiveStageScreenId(screenId);
    },
    [mp.setSelectedModelNodeId, mp.setActiveStageScreenId],
  );

  if (!mp.overlayOpen) return null;

  return (
    <div
      data-testid="market-posture-overlay"
      className="absolute inset-0 z-20 flex min-h-0 flex-col overflow-hidden border border-[var(--color-line)] bg-[var(--color-surface-0)]/95 shadow-lg backdrop-blur-sm"
      role="dialog"
      aria-label="Market posture day dashboard"
    >
      <header className="flex shrink-0 flex-col gap-1 border-b border-[var(--color-line)] px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-xs font-medium text-[var(--color-ink)]">Market posture · day</span>
            {hub && hub.sectorFocuses.length > 0 ? (
              <p className="truncate text-[10px] text-[var(--color-ink-faint)]">
                Sector lens: {hub.sectorFocuses.join(' · ')}
                {hub.universeExcludes.length > 0
                  ? ` · Exclude: ${hub.universeExcludes.join(', ')}`
                  : ''}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {(refreshing || analyzing || synthesis.activeRunId) && (
              <span
                className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)]"
                data-testid="market-posture-sync-state"
              >
                {analyzing || synthesis.activeRunId ? 'Analyzing…' : 'Syncing…'}
              </span>
            )}
            {hub ? <MarketPostureSourcesStrip sources={hub.sources} /> : null}
            <button
              type="button"
              onClick={() => void refresh(true)}
              disabled={refreshing || analyzing}
              title="Full hub reload (seals, reports, charts). Live equity/marks poll separately."
              className="border border-[var(--color-line)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-dim)] hover:border-[var(--color-ink-faint)] hover:text-[var(--color-ink)] disabled:opacity-50"
            >
              Sync
            </button>
            <button
              type="button"
              onClick={() => void onAnalyze()}
              disabled={analyzing || refreshing}
              title={
                lastAnalyzePhaseLabel
                  ? `Analyze for current moment (${lastAnalyzePhaseLabel}). Reseals stock movers, sector news, daily, narrative.`
                  : 'Analyze for current market moment (clock + session). Reseals stock movers, sector news, daily, narrative.'
              }
              className="border border-[var(--color-accent)] bg-[var(--color-accent)]/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 disabled:opacity-50"
              data-testid="market-posture-analyze"
            >
              {analyzing
                ? 'Analyze…'
                : lastAnalyzePhaseLabel
                  ? `Analyze · ${lastAnalyzePhaseLabel}`
                  : 'Analyze'}
            </button>
            <button
              type="button"
              onClick={mp.closeWorkspace}
              aria-label="Close market posture"
              className="rounded p-1 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        {synthesis.run &&
        (synthesis.activeRunId ||
          synthesis.run.status === 'running' ||
          synthesis.run.status === 'pending') ? (
          <div
            className="flex items-center justify-between gap-2 px-0 pt-1"
            data-testid="market-posture-overlay-synthesis-strip"
          >
            <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-dim)]">
              Synthesis {synthesis.run.status}
              {synthesis.run.stages.length > 0
                ? ` · ${
                    synthesis.run.stages.filter(
                      (s) =>
                        s.status === 'succeeded' ||
                        s.status === 'skipped' ||
                        s.status === 'failed',
                    ).length
                  }/${synthesis.run.stages.length} stages`
                : ''}
            </p>
            <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)]">
              Model strip ↓
            </span>
          </div>
        ) : null}
        {hub ? <MarketPostureFreshnessStrip freshness={hub.freshness} /> : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {error && !hub ? (
          <p className="p-3 text-xs text-[var(--color-block)]">{error}</p>
        ) : !hub && loading ? (
          <p className="p-3 font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            Loading dashboard…
          </p>
        ) : !hub ? (
          <p className="p-3 text-[10px] text-[var(--color-ink-faint)]">No posture data</p>
        ) : (
          <>
            <MarketPostureStageScreens
              hub={hub}
              equityLabel={equityLabel}
              dayLens={dayLens}
              setDayLens={setDayLens}
              watchlistTierFilter={watchlistTierFilter}
              setWatchlistTierFilter={setWatchlistTierFilter}
              filteredWatchlists={filteredWatchlists}
              moversStale={moversStale}
              openReport={openReport}
              confirmWatchlist={(id) => void confirmWatchlist(id)}
            />
            <aside
              data-testid="market-posture-overlay-model"
              className="flex h-[min(42vh,22rem)] min-h-[14rem] shrink-0 flex-col border-t border-[var(--color-line)] bg-[var(--color-surface-1)] px-2 py-1.5"
              aria-label="Synthesis model diagram strip"
            >
              <p className="mb-1 shrink-0 font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">
                Model · click node to open stage screen
              </p>
              <MarketPostureModelCanvas
                variant="strip"
                run={synthesis.run}
                hydration={hub.modelHydration ?? null}
                selectedNodeId={mp.selectedModelNodeId}
                onSelectNode={mp.setSelectedModelNodeId}
                onNavigate={onModelNavigate}
                className="min-h-0 flex-1"
              />
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
