'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { executionCapitalChip } from '@/lib/capital-mode-label';
import { simHonestyTickerLabel } from '@/lib/sim-honesty-label';
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
 * Ribbon ticker tape of recent executions (ui-spec: top app shell / D-206).
 * Stable chrome always paints; rows fill from lightweight …/executions/ticker.
 * Marquee only when there is content; text-first outcomes, color reinforces.
 */
export function ExecutionTicker(props: { companyId: string }) {
  const [rows, setRows] = useState<ExecutionRow[]>([]);
  const [phase, setPhase] = useState<'boot' | 'live' | 'empty' | 'error'>('boot');

  useEffect(() => {
    let stopped = false;
    let cancelled = false;

    async function load(isRefresh: boolean) {
      try {
        const r = await api<{ executions: ExecutionRow[] }>(
          `/api/companies/${props.companyId}/executions/ticker`,
          { signal: AbortSignal.timeout(8_000) },
        );
        if (stopped || cancelled) return;
        const next = r.executions.slice(0, 20);
        setRows(next);
        setPhase(next.length === 0 ? 'empty' : 'live');
      } catch {
        if (stopped || cancelled) return;
        // Keep prior rows on refresh failure; only flip empty→error on first paint.
        if (!isRefresh) {
          setRows([]);
          setPhase('error');
        }
      }
    }

    setPhase('boot');
    setRows([]);
    void load(false);
    const interval = setInterval(() => void load(true), 15_000);
    return () => {
      stopped = true;
      cancelled = true;
      clearInterval(interval);
    };
  }, [props.companyId]);

  return (
    <div
      className={`${styles.viewport} hidden min-w-0 flex-1 items-center overflow-hidden px-4 md:flex`}
      data-testid="execution-ticker"
      aria-busy={phase === 'boot'}
    >
      {phase === 'boot' && rows.length === 0 ? (
        <span
          className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]"
          data-testid="execution-ticker-loading"
        >
          Executions · …
        </span>
      ) : null}

      {phase === 'error' && rows.length === 0 ? (
        <span className="text-[11px] text-[var(--color-ink-faint)]">Executions unavailable</span>
      ) : null}

      {phase === 'empty' && rows.length === 0 ? (
        <span className="text-[11px] text-[var(--color-ink-faint)]">No executions yet</span>
      ) : null}

      {rows.length > 0 ? (
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
                {r.description ? (
                  <span className="text-[var(--color-ink-dim)]">{r.description}</span>
                ) : null}
                {honesty ? (
                  <span
                    className="text-[10px] text-[var(--color-ink-faint)]"
                    data-testid="execution-honesty-ticker"
                  >
                    {honesty}
                  </span>
                ) : null}
                {r.amountCents ? (
                  <span className="flex items-center gap-1 font-mono text-[var(--color-ink-faint)]">
                    <span
                      className="rounded border border-[var(--color-line)] px-1 text-[9px] uppercase tracking-wider text-[var(--color-ink-dim)]"
                      data-testid="execution-mode-chip"
                    >
                      {executionCapitalChip(r.mode ?? 'paper', r.venue ?? 'paper_sim')}
                    </span>
                    {amount(r.amountCents)}
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
