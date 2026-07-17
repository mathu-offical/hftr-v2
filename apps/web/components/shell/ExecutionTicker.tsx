'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import styles from './ticker.module.css';

interface ExecutionRow {
  id: string;
  outcome: string;
  description: string | null;
  amountCents: string | null;
  createdAt: string;
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
 */
export function ExecutionTicker(props: { companyId: string }) {
  const [rows, setRows] = useState<ExecutionRow[]>([]);

  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const r = await api<{ executions: ExecutionRow[] }>(
          `/api/companies/${props.companyId}/executions`,
        );
        if (!stopped) setRows(r.executions.slice(0, 20));
      } catch {
        // route may not exist yet during rollout; ticker stays empty
      }
    }
    void load();
    const interval = setInterval(load, 15_000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [props.companyId]);

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
        {[...rows, ...rows].map((r, i) => (
          <span key={`${r.id}-${i}`} className="flex items-center gap-1.5 text-[11px]">
            <span
              className="font-medium capitalize"
              style={{ color: OUTCOME_COLOR[r.outcome] ?? 'var(--color-ink-dim)' }}
            >
              {r.outcome}
            </span>
            {r.description && <span className="text-[var(--color-ink-dim)]">{r.description}</span>}
            {r.amountCents && (
              <span className="font-mono text-[var(--color-ink-faint)]">
                {amount(r.amountCents)}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
