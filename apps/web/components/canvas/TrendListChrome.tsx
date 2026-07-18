'use client';

import { Handle, Position } from '@xyflow/react';
import { handleIdForTrendCandidate } from '@hftr/contracts';
import type { CanvasTrendRow } from './types';

const LIST_WIDTH_PX = 220;

/**
 * D-077: docked trend list under a Trend card. Each row exposes a right-edge
 * directive-out handle (`directive-out__trend:{candidateId}`) for binding to
 * a trading module / execution engine.
 */
export function TrendListChrome(props: {
  trends: CanvasTrendRow[];
  maxActiveTrends: number;
}) {
  const rows = props.trends.slice(0, props.maxActiveTrends);

  if (rows.length === 0) {
    return (
      <div
        className="nodrag mt-1 rounded-md border border-dashed border-[var(--color-line)] bg-[var(--color-surface-0)]/70 px-2 py-1.5"
        style={{ width: LIST_WIDTH_PX }}
      >
        <p className="text-[9px] text-[var(--color-ink-faint)]">No trend candidates yet</p>
      </div>
    );
  }

  return (
    <div
      className="nodrag mt-1 overflow-hidden rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)]/90"
      style={{ width: LIST_WIDTH_PX }}
      aria-label="Trend candidates"
    >
      <div className="border-b border-[var(--color-line)] px-2 py-1 text-[8px] uppercase tracking-wider text-[var(--color-ink-faint)]">
        Trends · {rows.length}/{props.maxActiveTrends}
      </div>
      <ul className="max-h-40 overflow-y-auto nowheel">
        {rows.map((trend) => {
          const handleId = handleIdForTrendCandidate(trend.id);
          const bound = Boolean(trend.tradingModuleId || trend.engineInstanceId);
          return (
            <li
              key={trend.id}
              className="relative flex items-center gap-1.5 border-b border-[var(--color-line)]/60 px-2 py-1.5 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1">
                  <span className="text-[11px] font-medium text-[var(--color-ink)]">
                    {trend.symbol}
                  </span>
                  <span className="text-[9px] text-[var(--color-ink-dim)]">{trend.direction}</span>
                </div>
                <div className="truncate text-[9px] text-[var(--color-ink-faint)]">
                  {trend.strengthBand} · {trend.status}
                  {bound ? ' · bound' : ''}
                </div>
              </div>
              <Handle
                type="source"
                position={Position.Right}
                id={handleId}
                className="!h-2.5 !w-2.5 !border !border-[var(--color-accent)] !bg-[var(--color-surface-1)]"
                style={{ right: -5 }}
                title={`Bind ${trend.symbol} to trading / engine`}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
