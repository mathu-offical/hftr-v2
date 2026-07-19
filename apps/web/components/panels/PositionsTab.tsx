'use client';

import { useEffect, useMemo, useState } from 'react';
import type { MarketHubPosition, MarketHubPipelineBySymbol } from '@hftr/contracts';
import { SymbolTicker } from '@/components/market/SymbolTicker';
import { Justification } from '@/components/panels/Justification';
import {
  dollarsFromCents,
  pnlLabel,
  pnlToneClass,
} from '@/components/panels/market-posture-format';
import { TraceTimeline } from '@/components/panels/TraceTimeline';
import { api } from '@/lib/client';
import { useMarketHub } from '@/lib/use-market-hub';
import { InlineLoadingStrip } from '@/components/shell/LoadingChrome';
import { toneFor } from './format';

export type PositionsExecutionRow = {
  id: string;
  moduleId: string;
  venue: string;
  mode: string;
  outcome: string;
  failureCode: string | null;
  amountCents: string | null;
  description: string | null;
  createdAt: string;
  leadId?: string | null;
  treeId?: string | null;
};

type ExitPreviewRow = {
  id: string;
  symbol: string;
  moduleId: string;
  nextExitReason: string | null;
  nextExitLabel: string | null;
  recoveryPhase: string | null;
};

function stabilityLabel(heldVsCost: 'up' | 'down' | 'flat' | null): string {
  switch (heldVsCost) {
    case 'up':
      return 'Above cost';
    case 'down':
      return 'Below cost';
    case 'flat':
      return 'At cost';
    case null:
      return 'No cost basis';
    default: {
      const _exhaustive: never = heldVsCost;
      return _exhaustive;
    }
  }
}

/**
 * Right-panel Positions tab: open holdings with stability, recovery ladder,
 * next model-free exit candidate, and recent agent/execution actions.
 */
export function PositionsTab(props: {
  companyId: string;
  executions: PositionsExecutionRow[];
}) {
  const { data: hub, loading, error } = useMarketHub(props.companyId, { poll: true });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exitById, setExitById] = useState<Map<string, ExitPreviewRow>>(new Map());
  const [openTraceId, setOpenTraceId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api<{ positions: ExitPreviewRow[] }>(
      `/api/companies/${props.companyId}/positions`,
    )
      .then((res) => {
        if (cancelled) return;
        const map = new Map<string, ExitPreviewRow>();
        for (const p of res.positions) map.set(p.id, p);
        setExitById(map);
      })
      .catch(() => {
        if (!cancelled) setExitById(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [props.companyId, hub?.freshness.fetchedAt]);

  const held = useMemo(
    () => (hub?.positions ?? []).filter((p) => String(p.qty) !== '0'),
    [hub?.positions],
  );

  useEffect(() => {
    if (selectedId && !held.some((p) => p.id === selectedId)) {
      setSelectedId(null);
    }
  }, [held, selectedId]);

  const selected = held.find((p) => p.id === selectedId) ?? null;
  const pipeline: MarketHubPipelineBySymbol | null = selected
    ? (hub?.pipeline.find((row) => row.symbol === selected.symbol) ?? null)
    : null;
  const exitPreview = selected ? (exitById.get(selected.id) ?? null) : null;

  const relatedExecutions = useMemo(() => {
    if (!selected) return [];
    const treeId = pipeline?.tree?.id ?? null;
    return props.executions
      .filter((e) => {
        if (treeId && e.treeId === treeId) return true;
        if (e.moduleId === selected.moduleId) return true;
        if (e.description?.toUpperCase().includes(selected.symbol.toUpperCase())) return true;
        return false;
      })
      .slice(0, 12);
  }, [props.executions, selected, pipeline?.tree?.id]);

  if (error && !hub) {
    return <p className="px-1 text-xs text-[var(--color-block)]">{error}</p>;
  }

  if (!hub && loading) {
    return (
      <InlineLoadingStrip
        className="px-1"
        label="Positions"
        detail="…"
        bar={false}
        data-testid="positions-tab-loading"
      />
    );
  }

  if (held.length === 0) {
    return (
      <p className="px-1 text-xs text-[var(--color-ink-faint)]">
        No open positions. Holdings appear here after paper fills.
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="right-panel-positions">
      <ul className="space-y-1.5">
        {held.map((p) => (
          <li key={p.id}>
            <PositionRowButton
              position={p}
              selected={p.id === selectedId}
              nextExitLabel={exitById.get(p.id)?.nextExitLabel ?? null}
              onSelect={() => setSelectedId(p.id === selectedId ? null : p.id)}
            />
          </li>
        ))}
      </ul>

      {selected ? (
        <PositionInspector
          position={selected}
          pipeline={pipeline}
          exitPreview={exitPreview}
          executions={relatedExecutions}
          onOpenTrace={setOpenTraceId}
        />
      ) : (
        <p className="px-1 text-[10px] text-[var(--color-ink-faint)]">
          Select a holding to view stability, recovery, and agent actions.
        </p>
      )}

      {openTraceId ? (
        <TraceTimeline
          companyId={props.companyId}
          traceId={openTraceId}
          onClose={() => setOpenTraceId(null)}
        />
      ) : null}
    </div>
  );
}

function PositionRowButton(props: {
  position: MarketHubPosition;
  selected: boolean;
  nextExitLabel: string | null;
  onSelect: () => void;
}) {
  const { position: p } = props;
  return (
    <button
      type="button"
      data-testid={`right-panel-position-${p.id}`}
      onClick={props.onSelect}
      aria-pressed={props.selected}
      className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${
        props.selected
          ? 'border-[var(--color-accent)] bg-[var(--color-surface-2)]'
          : 'border-[var(--color-line)] hover:border-[var(--color-ink-faint)]'
      }`}
    >
      <Justification
        sourceClass="derived"
        block
        lines={[
          'Open position from paper fill book with synthetic mark until live broker marks.',
          `Module: ${p.moduleName}.`,
          p.viz.heldVsCost
            ? `Stability: ${stabilityLabel(p.viz.heldVsCost)}.`
            : 'No held-vs-cost tone.',
          props.nextExitLabel
            ? `Next auto-exit candidate: ${props.nextExitLabel}.`
            : 'No auto-exit signal right now.',
        ]}
      >
        <SymbolTicker
          viz={p.viz}
          density="compact"
          meta={
            <span className="font-mono text-[10px] text-[var(--color-ink-faint)]">
              qty {p.qty}
              {p.engines.length > 0 ? ` · ${p.engines.map((e) => e.label).join(' · ')}` : ''}
            </span>
          }
        />
      </Justification>
    </button>
  );
}

function PositionInspector(props: {
  position: MarketHubPosition;
  pipeline: MarketHubPipelineBySymbol | null;
  exitPreview: ExitPreviewRow | null;
  executions: PositionsExecutionRow[];
  onOpenTrace: (id: string) => void;
}) {
  const { position: p, pipeline, exitPreview } = props;
  const heldVsCost = p.viz.heldVsCost;

  return (
    <section
      data-testid="right-panel-position-detail"
      className="space-y-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-0)] p-2.5"
      aria-label={`Holding detail ${p.symbol}`}
    >
      <div>
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Holding · {p.symbol}
        </h3>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          <div>
            <dt className="text-[10px] text-[var(--color-ink-faint)]">Module</dt>
            <dd>{p.moduleName}</dd>
          </div>
          <div>
            <dt className="text-[10px] text-[var(--color-ink-faint)]">Qty</dt>
            <dd className="font-mono tabular-nums">{p.qty}</dd>
          </div>
          <div>
            <dt className="text-[10px] text-[var(--color-ink-faint)]">Avg / Mark</dt>
            <dd className="font-mono tabular-nums">
              {dollarsFromCents(p.avgCostCents)} / {dollarsFromCents(p.markCents)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] text-[var(--color-ink-faint)]">Unrealized</dt>
            <dd className={`font-mono tabular-nums ${pnlToneClass(heldVsCost)}`}>
              {pnlLabel(p.unrealizedPnlCents)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] text-[var(--color-ink-faint)]">Realized</dt>
            <dd className="font-mono tabular-nums">{pnlLabel(p.realizedPnlCents)}</dd>
          </div>
          <div>
            <dt className="text-[10px] text-[var(--color-ink-faint)]">Engines</dt>
            <dd className="text-[11px] text-[var(--color-ink-dim)]">
              {p.engines.length > 0 ? p.engines.map((e) => e.label).join(' · ') : '—'}
            </dd>
          </div>
        </dl>
        <p className="mt-1.5 text-[10px] text-[var(--color-ink-faint)]">
          Marks synthetic until live broker marks
        </p>
      </div>

      <div className="border-t border-[var(--color-line)] pt-2">
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Stability
        </h3>
        <p className="mt-1 text-xs text-[var(--color-ink)]">
          {stabilityLabel(heldVsCost)}
          <span className="text-[var(--color-ink-dim)]">
            {' · '}
            strength {p.viz.strengthBand} ({p.viz.strengthTicks}/3)
            {' · '}
            {p.viz.direction}
          </span>
        </p>
      </div>

      <div className="border-t border-[var(--color-line)] pt-2">
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Automatic recovery
        </h3>
        <Justification
          sourceClass="deterministic_placeholder"
          block
          lines={[
            'Model-free position exits and recovery ladder phases — no LLM below compile.',
            exitPreview?.nextExitLabel
              ? `Next exit candidate: ${exitPreview.nextExitLabel}.`
              : 'No exit signal active for this holding right now.',
            exitPreview?.recoveryPhase
              ? `Recovery phase: ${exitPreview.recoveryPhase}.`
              : 'No recovery phase mapped.',
          ]}
        >
          <div className="mt-1 space-y-1 text-xs text-[var(--color-ink-dim)]">
            {exitPreview?.nextExitLabel ? (
              <p>
                Next exit:{' '}
                <span className="font-mono text-[var(--color-ink)]">
                  {exitPreview.nextExitLabel}
                </span>
                {exitPreview.recoveryPhase ? (
                  <span className="text-[var(--color-ink-faint)]">
                    {' '}
                    · phase {exitPreview.recoveryPhase}
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="text-[10px] text-[var(--color-ink-faint)]">
                No auto-exit candidate right now.
              </p>
            )}
            {pipeline?.tree?.recoveryLadder?.length ? (
              <p className="text-[10px]">
                Ladder: {pipeline.tree.recoveryLadder.join(' → ')}
              </p>
            ) : (
              <p className="text-[10px] text-[var(--color-ink-faint)]">
                No recovery ladder recorded on the decision tree.
              </p>
            )}
          </div>
        </Justification>
      </div>

      <div className="border-t border-[var(--color-line)] pt-2">
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Agent actions
        </h3>
        <p className="mt-1 text-xs text-[var(--color-ink-dim)]">
          Lead: {pipeline?.lead?.status ?? 'none'}
          {pipeline?.lead
            ? ` · ${pipeline.lead.direction} · ${pipeline.lead.strategyFamily}`
            : ''}
        </p>
        <p className="mt-0.5 text-xs text-[var(--color-ink-dim)]">
          Tree: {pipeline?.tree?.status ?? 'none'}
        </p>
        {props.executions.length === 0 ? (
          <p className="mt-2 text-[10px] text-[var(--color-ink-faint)]">
            No recent executions for this holding.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {props.executions.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => props.onOpenTrace(e.id)}
                  className="w-full rounded-md border border-[var(--color-line)] px-2 py-1.5 text-left hover:bg-[var(--color-surface-2)]"
                  aria-label={`Open trace for ${e.description ?? e.outcome}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-[11px] font-medium capitalize"
                      style={{ color: toneFor(e.outcome) }}
                    >
                      {e.outcome}
                    </span>
                    <span className="text-[10px] text-[var(--color-ink-faint)]">
                      {new Date(e.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-[var(--color-ink-dim)]">
                    {e.description ?? e.failureCode ?? `${e.venue} · ${e.mode}`}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
