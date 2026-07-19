'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { executionCapitalChip } from '@/lib/capital-mode-label';
import { simHonestyTickerLabel } from '@/lib/sim-honesty-label';
import { InlineLoadingStrip } from '@/components/shell/LoadingChrome';
import styles from './ticker.module.css';

interface ExecutionRow {
  id: string;
  outcome: string;
  description: string | null;
  amountCents: string | null;
  mode: string;
  venue: string;
  createdAt: string;
  simulatorGapTags?: string[];
}

const OUTCOME_COLOR: Record<string, string> = {
  filled: 'var(--color-ok)',
  blocked: 'var(--color-block)',
  rejected: 'var(--color-warn)',
};

function amount(cents: string): string {
  const n = BigInt(cents);
  const sign = n < 0n ? '-' : '+';
  const abs = n < 0n ? -n : n;
  return `${sign}$${(abs / 100n).toLocaleString()}.${String(abs % 100n).padStart(2, '0')}`;
}

/**
 * Ribbon ticker tape of recent executions (ui-ux spec: top app shell).
 * Marquee only when there is content; text-first outcomes, color reinforces.
 * Amounts carry a paper/live chip so fill dollars are never ambiguous (D-167).
 */
export function ExecutionTicker(props: { companyId: string }) {
  const [rows, setRows] = useState<ExecutionRow[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready'>('loading');

  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const r = await api<{ executions: ExecutionRow[] }>(
          `/api/companies/${props.companyId}/executions`,
        );
        if (!stopped) {
          setRows(r.executions.slice(0, 20));
          setLoadState('ready');
        }
      } catch {
        // route may not exist yet during rollout; treat as empty ready
        if (!stopped) {
          setRows([]);
          setLoadState('ready');
        }
      }
    }
    void load();
    const interval = setInterval(load, 15_000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [props.companyId]);

  if (loadState === 'loading') {
    return (
      <div
        className="hidden min-w-0 flex-1 items-center overflow-hidden px-4 md:flex"
        data-testid="execution-ticker-loading"
      >
        <InlineLoadingStrip
          className="w-full max-w-md"
          label="Executions"
          detail="fetching"
        />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="hidden min-w-0 flex-1 items-center overflow-hidden px-4 md:flex">
        <span className="text-[11px] text-[var(--color-ink-faint)]">No executions yet</span>
      </div>
    );
  }

  return (
    <div
      className={`${styles.viewport} hidden min-w-0 flex-1 items-center overflow-hidden px-4 md:flex`}
    >
      <div className={`${styles.track} flex items-center gap-6 whitespace-nowrap`}>
        {[...rows, ...rows].map((r, i) => {
          const honesty = simHonestyTickerLabel(r.simulatorGapTags);
          return (
          <span key={`${r.id}-${i}`} className="flex items-center gap-1.5 text-[11px]">
            <span
              className="font-medium capitalize"
              style={{ color: OUTCOME_COLOR[r.outcome] ?? 'var(--color-ink-dim)' }}
            >
              {r.outcome}
            </span>
            {r.description && <span className="text-[var(--color-ink-dim)]">{r.description}</span>}
            {honesty && (
              <span
                className="text-[10px] text-[var(--color-ink-faint)]"
                data-testid="execution-honesty-ticker"
              >
                {honesty}
              </span>
            )}
            {r.amountCents && (
              <span className="flex items-center gap-1 font-mono text-[var(--color-ink-faint)]">
                <span
                  className="rounded border border-[var(--color-line)] px-1 text-[9px] uppercase tracking-wider text-[var(--color-ink-dim)]"
                  data-testid="execution-mode-chip"
                >
                  {executionCapitalChip(r.mode ?? 'paper', r.venue ?? 'paper_sim')}
                </span>
                {amount(r.amountCents)}
              </span>
            )}
          </span>
          );
        })}
      </div>
    </div>
  );
}
